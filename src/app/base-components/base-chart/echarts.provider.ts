import { provideEchartsCore } from 'ngx-echarts';

// SVG lets the app redact chart text without rebuilding the chart.
export const appChartInitOptions = { renderer: 'svg' as const };

export function provideAppEcharts() {
  return provideEchartsCore({
    echarts: () => import('echarts'),
  });
}
