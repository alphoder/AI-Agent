'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Check, Sparkles, AlertCircle, Loader2, Download } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accent } from '@/components/ui/accent';

interface BillingState {
  plan: 'free' | 'pro';
  upgradedAt?: string;
}

interface SessionRow {
  duration_sec: number | null;
  status: string;
}

export default function BillingPage() {
  const { user, setUser } = useAuth();
  
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(true);
  const [totalMin, setTotalMin] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  // Fetch practice sessions to calculate monthly usage
  useEffect(() => {
    apiClient
      .get('/sessions')
      .then(({ data }) => {
        const rows: SessionRow[] = data.data || [];
        const seconds = rows
          .filter((r) => r.status === 'completed')
          .reduce((acc, r) => acc + (r.duration_sec || 0), 0);
        setTotalMin(Math.round(seconds / 60));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  interface BillingData {
    plan: 'free' | 'pro';
    cardBrand?: string;
    cardLast4?: string;
    upgradedAt?: string;
    invoices?: { id: string; date: string; description: string; amount: string; status: string }[];
  }

  const [billingInfo, setBillingInfo] = useState<BillingData | null>(null);

  // Sync plan status from metadata
  useEffect(() => {
    if (user?.metadata?.billing) {
      const b = user.metadata.billing as BillingData;
      setBillingInfo(b);
      if (b.plan) setPlan(b.plan);
    } else {
      setBillingInfo(null);
      setPlan('free');
    }
  }, [user]);

  async function handleUpgrade(e: React.FormEvent) {
    e.preventDefault();
    setUpgrading(true);
    try {
      const brand = cardNumber.trim().startsWith('4') ? 'Visa' : 'Mastercard';
      const cleanCard = cardNumber.replace(/\s/g, '');
      const last4 = cleanCard.slice(-4) || '4444';
      
      const newInvoice = {
        id: `INV-${Math.floor(100000 + Math.random() * 900000)}`,
        date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
        description: 'SpeakCoach Pro Subscription Upgrade',
        amount: '$15.00',
        status: 'Paid',
      };

      const currentInvoices = billingInfo?.invoices || [];

      const payload = {
        billing: {
          plan: 'pro',
          cardBrand: brand,
          cardLast4: last4,
          upgradedAt: new Date().toISOString(),
          invoices: [newInvoice, ...currentInvoices],
        },
      };
      
      const { data } = await apiClient.patch('/auth/me/metadata', payload);
      if (data.success) {
        setUser(data.data);
        setPlan('pro');
        setShowCheckout(false);
      }
    } catch (err) {
      console.error('Upgrade failed', err);
    } finally {
      setUpgrading(false);
    }
  }

  async function handleDowngrade() {
    if (!window.confirm('Are you sure you want to cancel your Pro plan? You will lose unlimited minutes.')) return;
    setLoading(true);
    try {
      const payload = {
        billing: {
          ...(billingInfo || {}),
          plan: 'free',
          cardBrand: undefined,
          cardLast4: undefined,
        },
      };
      const { data } = await apiClient.patch('/auth/me/metadata', payload);
      if (data.success) {
        setUser(data.data);
        setPlan('free');
      }
    } catch (err) {
      console.error('Downgrade failed', err);
    } finally {
      setLoading(false);
    }
  }

  const FREE_LIMIT = 60; // 60 minutes included in free tier
  const percentUsed = Math.min(100, Math.round((totalMin / FREE_LIMIT) * 100));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Billing & Plan</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Manage your subscription, review monthly usage and download receipts.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left column: Current Plan & Usage */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Plan</p>
                <h2 className="text-2xl font-bold mt-1">
                  {plan === 'pro' ? (
                    <span className="flex items-center gap-2">
                      SpeakCoach <Accent>Pro</Accent>
                    </span>
                  ) : (
                    'Free Practice Plan'
                  )}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {plan === 'pro'
                    ? 'Thank you for supporting SpeakCoach! Your subscription is active.'
                    : 'A clean, limited plan to practice speaking confidence.'}
                </p>
                {plan === 'pro' && billingInfo?.cardLast4 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Payment Method: <span className="font-semibold text-foreground">{billingInfo.cardBrand} ending in •••• {billingInfo.cardLast4}</span>
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {plan === 'pro' ? (
                  <Button
                    variant="outline"
                    onClick={handleDowngrade}
                    className="rounded-full text-xs text-rose-500 border-rose-500/20 hover:bg-rose-500/5 hover:text-rose-500"
                  >
                    Cancel Plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowCheckout(true)}
                    className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
                  >
                    <Sparkles className="h-4 w-4" /> Upgrade to Pro
                  </Button>
                )}
              </div>
            </div>

            {/* Usage Progress */}
            <div className="mt-8 border-t border-border pt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Monthly Usage</span>
                <span className="text-muted-foreground">
                  {plan === 'pro' ? (
                    <><span className="text-foreground font-semibold">{totalMin}</span> minutes used (Unlimited)</>
                  ) : (
                    <><span className="text-foreground font-semibold">{totalMin}</span> / {FREE_LIMIT} mins</>
                  )}
                </span>
              </div>
              {plan === 'free' && (
                <>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  {percentUsed >= 80 && (
                    <p className="text-xs text-amber-500 flex items-center gap-1.5 mt-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      You have used {percentUsed}% of your free minutes. Upgrade to keep practicing.
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Pricing Plans details */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-3 opacity-80">
              <h3 className="font-semibold text-sm">Free Plan</h3>
              <p className="text-2xl font-bold tracking-tight">$0</p>
              <ul className="text-xs text-muted-foreground space-y-2 pt-2">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> 60 practice minutes per month</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> Standard practice scenarios</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> Voice assistant guidance (Bixy)</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> Local body-language webcam reads</li>
              </ul>
            </div>

            <div className={`rounded-2xl border p-5 space-y-3 relative ${plan === 'pro' ? 'border-primary bg-primary/[0.02]' : 'border-border bg-card'}`}>
              {plan === 'pro' && (
                <span className="absolute top-3 right-3 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                  Active
                </span>
              )}
              <h3 className="font-semibold text-sm flex items-center gap-1">
                Pro Plan <Sparkles className="h-3.5 w-3.5 text-primary" />
              </h3>
              <p className="text-2xl font-bold tracking-tight">$15<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              <ul className="text-xs text-muted-foreground space-y-2 pt-2">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> **Unlimited** practice minutes</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> Premium Gemini AI voices</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> Full PDF report downloads</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary shrink-0" /> Priority features & early access</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right column: Invoice Logs */}
        <div className="md:col-span-1">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoices & Receipts</h2>
            {plan === 'pro' && billingInfo?.invoices && billingInfo.invoices.length > 0 ? (
              <div className="divide-y divide-border text-xs space-y-3">
                {billingInfo.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between pt-3">
                    <div>
                      <p className="font-medium text-foreground">{inv.id}</p>
                      <p className="text-muted-foreground mt-0.5">{inv.date} · Paid</p>
                    </div>
                    <button className="press p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground">
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No billing history or invoices yet. Upgrade to SpeakCoach Pro to start practicing with unlimited minutes.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCheckout(false)} />
          <Card className="relative w-full max-w-md p-6 bg-card border border-border animate-pop-in">
            <h3 className="text-lg font-bold">Upgrade to SpeakCoach Pro</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Gain unlimited minutes and unlock detailed downloadable PDF reports.
            </p>

            <form onSubmit={handleUpgrade} className="space-y-4 mt-6">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Card Number</label>
                <input
                  type="text"
                  required
                  placeholder="4111 2222 3333 4444"
                  maxLength={19}
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9 ]/g, ''))}
                  className="w-full rounded-lg border border-border bg-secondary/30 px-3.5 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiry</label>
                  <input
                    type="text"
                    required
                    placeholder="MM/YY"
                    maxLength={5}
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value.replace(/[^0-9/]/g, ''))}
                    className="w-full rounded-lg border border-border bg-secondary/30 px-3.5 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CVC</label>
                  <input
                    type="password"
                    required
                    placeholder="•••"
                    maxLength={3}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full rounded-lg border border-border bg-secondary/30 px-3.5 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCheckout(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={upgrading}
                  className="rounded-full px-6 flex items-center gap-1.5"
                >
                  {upgrading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {upgrading ? 'Processing...' : 'Pay $15.00'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
