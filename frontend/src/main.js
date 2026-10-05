import * as FloatingUIDOM from "@floating-ui/dom";
import { BarChart, FunnelChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import "./styles.css";

echarts.use([
  AriaComponent,
  BarChart,
  FunnelChart,
  GridComponent,
  LegendComponent,
  LineChart,
  SVGRenderer,
  TooltipComponent,
]);

globalThis.FloatingUIDOM = FloatingUIDOM;
globalThis.echarts = echarts;

import("./dashboard.js").then(() => import("./tooltips.js"));
