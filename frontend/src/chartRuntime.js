import * as FloatingUIDOM from "@floating-ui/dom";
import { BarChart, FunnelChart, LineChart, PieChart, SankeyChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  GraphicComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  AriaComponent,
  BarChart,
  FunnelChart,
  GridComponent,
  GraphicComponent,
  LegendComponent,
  LineChart,
  PieChart,
  SankeyChart,
  SVGRenderer,
  TooltipComponent,
]);

globalThis.FloatingUIDOM = FloatingUIDOM;
globalThis.echarts = echarts;

