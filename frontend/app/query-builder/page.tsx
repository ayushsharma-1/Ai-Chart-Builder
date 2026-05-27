'use client';

import AccountIdModal from '@/components/ui/AccountIdModal';
import Navbar from '@/components/ui/Navbar';
import QBWorkspace from '@/components/queryBuilder/QBWorkspace';
import QBSidebar from '@/components/queryBuilder/QBSidebar';
import { useAccountId } from '@/hooks/useAccountId';
import { useQueryBuilder } from '@/hooks/useQueryBuilder';
import { SCHEMA_TABLES } from '@/lib/dataModel';

export default function QueryBuilderPage() {
	const { accountId } = useAccountId();
	const {
		plan,
		previewData,
		previewSql,
		previewRowCount,
		previewExecutionTimeMs,
		previewLoading,
		previewError,
		finalResult,
		finalLoading,
		finalError,
		setPlan,
		runPreview,
		runFinal,
	} = useQueryBuilder();

	return (
		<div className="flex h-screen flex-col bg-slate-50 text-slate-900">
			<Navbar />

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<QBSidebar plan={plan} onChange={setPlan} schema={SCHEMA_TABLES} />
				<QBWorkspace
					plan={plan}
					onChange={setPlan}
					previewData={previewData}
					previewSql={previewSql}
					previewRowCount={previewRowCount}
					previewExecutionTimeMs={previewExecutionTimeMs}
					previewLoading={previewLoading}
					previewError={previewError}
					finalResult={finalResult}
					finalLoading={finalLoading}
					finalError={finalError}
					runPreview={runPreview}
					runFinal={runFinal}
				/>
			</div>

			{!accountId && <AccountIdModal />}
		</div>
	);
}
