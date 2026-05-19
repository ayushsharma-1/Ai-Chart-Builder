'use client';

import { Responsive, WidthProvider } from '@eleung/react-grid-layout';

import { SavedChart } from '@/types';

import DashboardCard from './DashboardCard';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface Props {
  readonly charts: SavedChart[];
  readonly onDelete: (id: string) => void;
  readonly onLayoutChange: (id: string, pos: SavedChart['gridPosition']) => void;
}

export default function DashboardGrid({ charts, onDelete, onLayoutChange }: Props) {
  const layout = charts.map((chart) => ({
    i: chart._id,
    x: chart.gridPosition.x,
    y: chart.gridPosition.y,
    w: chart.gridPosition.w,
    h: chart.gridPosition.h,
    minW: 3,
    minH: 3,
  }));

  const handleLayoutChange = (currentLayout: any[]) => {
    currentLayout.forEach((item) => {
      const chart = charts.find((candidate) => candidate._id === item.i);

      if (chart) {
        onLayoutChange(item.i, { x: item.x, y: item.y, w: item.w, h: item.h });
      }
    });
  };

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layout }}
      breakpoints={{ lg: 1200, md: 996, sm: 768 }}
      cols={{ lg: 12, md: 10, sm: 6 }}
      rowHeight={80}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".drag-handle"
    >
      {charts.map((chart) => (
        <div key={chart._id}>
          <DashboardCard chart={chart} onDelete={onDelete} />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}