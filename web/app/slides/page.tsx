import type { Metadata } from 'next';
import Slides from '@/components/Slides';

export const metadata: Metadata = {
  title: 'Bangkok Ground Watch: demo deck',
  description: 'Seven slides: NISAR radar and Sentinel-1 flood history for Bangkok.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Slides />;
}
