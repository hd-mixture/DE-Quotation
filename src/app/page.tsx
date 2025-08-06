import QuotationLayout from '@/components/quotation-layout';
import { Suspense } from 'react';

function PageContent() {
  return <QuotationLayout />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading...</div>}>
      <PageContent />
    </Suspense>
  );
}
