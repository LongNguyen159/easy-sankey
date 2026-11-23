import { provideEchartsCore } from 'ngx-echarts';

export function provideAppEcharts() {
  return provideEchartsCore({
    echarts: () => import('echarts'),
  });
}
