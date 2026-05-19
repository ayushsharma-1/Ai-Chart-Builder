'use client';

interface Props {
  data: any[];
  xAxis: string;
  yAxis: string;
  colors: string[];
}

export default function TableView({ data }: Props) {
  if (!data.length) {
    return null;
  }

  const columns = Object.keys(data[0] || {});

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#1E1E2E]">
            {columns.map((column) => (
              <th key={column} className="text-left py-3 px-4 text-[#7B7B9A] font-medium uppercase tracking-wider text-xs whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[#1E1E2E] hover:bg-[#16161F] transition-colors">
              {columns.map((column) => (
                <td key={column} className="py-3 px-4 text-[#F0F0FF]">
                  {row[column] !== null && row[column] !== undefined ? String(row[column]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}