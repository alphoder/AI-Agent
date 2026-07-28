import { redirect } from 'next/navigation';

// /home moved to /journey in the v2 IA; old links and bookmarks land here.
export default function HomeRedirect() {
  redirect('/journey');
}
