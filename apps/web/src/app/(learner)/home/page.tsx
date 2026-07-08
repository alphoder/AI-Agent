import { redirect } from 'next/navigation';

// The product is focused on practice — Practice is the home. No dashboard.
export default function Home() {
  redirect('/scenarios');
}
