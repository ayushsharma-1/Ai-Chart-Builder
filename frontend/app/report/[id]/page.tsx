import ReportWorkspace from '@/components/reports/ReportWorkspace';

export default function ReportViewPage({ params }: Readonly<{ params: { id: string } }>) {
  return <ReportWorkspace reportId={params.id} mode="view" />;
}
