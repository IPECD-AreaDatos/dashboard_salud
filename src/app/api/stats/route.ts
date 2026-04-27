import { NextResponse } from "next/server";

export async function GET() {
  // Mock data for the dashboard
  const stats = {
    totalPatients: 12543,
    activeAlerts: 42,
    avgSatisfaction: 4.8,
    growthRate: 12.5,
    trends: [
      { name: "Ene", value: 400, alerts: 24 },
      { name: "Feb", value: 300, alerts: 18 },
      { name: "Mar", value: 600, alerts: 32 },
      { name: "Abr", value: 800, alerts: 45 },
      { name: "May", value: 500, alerts: 30 },
      { name: "Jun", value: 700, alerts: 38 },
    ]
  };

  return NextResponse.json(stats);
}
