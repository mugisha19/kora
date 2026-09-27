import { BarChart, LineChart } from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

/*
 * The ECharts parts the backlog's sprint charts draw (burndown lines, velocity bars with an
 * average line), loaded lazily through `provideEchartsCore` on the backlog route.
 */
echarts.use([
  BarChart,
  LineChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export { echarts };
