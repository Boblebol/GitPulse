import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartPoint {
  date: string;  // YYYY-MM-DD
  value: number;
}

interface Props {
  data: ChartPoint[];
  valueLabel?: string;
  color?: string;
  height?: number;
}

const toMD = (d: string) => {
  const parts = d.split("-");
  return `${parts[1]}/${parts[2]}`;
};

export default function ActivityChart({
  data,
  valueLabel = "Value",
  color = "#ffb599",
  height = 120,
}: Props) {
  const gradId = `ag-${color.replace("#", "")}`;

  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-on-surface-variant text-xs"
        style={{ height }}
      >
        No data for this period.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={toMD}
          tick={{
            fill: "#9ba5c0",
            fontSize: 10,
            fontFamily: "Public Sans, sans-serif",
          }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <Tooltip
          contentStyle={{
            background: "#222a3d",
            border: "1px solid rgba(89,65,56,0.3)",
            borderRadius: 6,
            color: "#dae2fd",
            fontSize: 12,
            fontFamily: "Public Sans, sans-serif",
          }}
          labelStyle={{ color: "#9ba5c0", marginBottom: 2, fontSize: 11 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [Number(v).toFixed(1), valueLabel]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelFormatter={(label: any) => toMD(String(label))}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
