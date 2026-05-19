declare module '@eleung/react-grid-layout' {
  import * as React from 'react';

  export const Responsive: React.ComponentType<any>;
  export const WidthProvider: (component: React.ComponentType<any>) => React.ComponentType<any>;
}