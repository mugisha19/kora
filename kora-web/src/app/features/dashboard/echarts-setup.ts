import { PieChart } from 'echarts/charts';
import { AriaComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

/*
 * Only the ECharts parts the dashboard draws (pie and bar charts, accessible descriptions and
 * decal patterns), loaded on demand: this file is imported lazily by `provideEchartsCore`, so the
 * library never reaches the initial bundle.
 */
echarts.use([PieChart, AriaComponent, CanvasRenderer]);

export { echarts };
