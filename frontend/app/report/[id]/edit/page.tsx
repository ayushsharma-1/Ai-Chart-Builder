import ReportWorkspace from '@/components/reports/ReportWorkspace';

export default function ReportEditPage({ params }: Readonly<{ params: { id: string } }>) {
  return <ReportWorkspace reportId={params.id} mode="edit" />;
}
