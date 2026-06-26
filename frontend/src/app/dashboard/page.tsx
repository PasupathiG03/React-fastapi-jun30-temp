"use client";

import { useEffect, useState } from "react";
import { FileText, BarChart2, BookOpen, Users, TrendingUp, Clock, ArrowUpRight } from "lucide-react";

const STATS = [
  { label: "Total Documents", icon: FileText,  iconColor: "#1d55e8", bg: "#eff3fe" },
  { label: "Total Reports",   icon: BarChart2, iconColor: "#0ea575", bg: "#ecfdf5" },
  { label: "Templates",       icon: BookOpen,  iconColor: "#f59e0b", bg: "#fffbeb" },
  { label: "Active Users",    icon: Users,     iconColor: "#8b5cf6", bg: "#f5f3ff" },
];

const QUICK_ACTIONS = [
  { label: "Upload Document", href: "/dashboard/documents" },
  { label: "Generate Report", href: "/dashboard/reports"   },
  { label: "New Template",    href: "/dashboard/templates" },
  { label: "Open Chat",       href: "/dashboard/chat"      },
];

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-7 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-28 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

function QuickActionSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
      {/* header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 rounded bg-gray-200" />
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>
      {/* rows */}
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-100">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
      {/* header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 rounded bg-gray-200" />
        <div className="h-4 w-28 bg-gray-200 rounded" />
      </div>
      {/* rows */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-48 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      {loading ? (
        <div className="rounded-2xl p-6 animate-pulse bg-gray-200">
          <div className="h-3.5 w-24 bg-gray-300 rounded mb-3" />
          <div className="h-7 w-52 bg-gray-300 rounded mb-3" />
          <div className="h-3.5 w-80 bg-gray-300 rounded" />
        </div>
      ) : (
        <div
          className="rounded-2xl p-6 text-white"
          style={{ background: "linear-gradient(135deg, #1d55e8 0%, #1235b0 100%)" }}
        >
          <p className="text-blue-200 text-sm font-medium mb-1">Welcome back</p>
          <h2 className="text-2xl font-bold">AI Report Platform</h2>
          <p className="text-blue-200 text-sm mt-1">
            Upload documents, generate AI-powered reports, and export with ease.
          </p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
          : STATS.map(({ label, icon: Icon, iconColor, bg }) => (
              <div key={label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-6 h-6" style={{ color: iconColor }} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">0</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              </div>
            ))
        }
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loading ? (
          <>
            <QuickActionSkeleton />
            <ActivitySkeleton />
          </>
        ) : (
          <>
            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-700 text-sm">Quick Actions</h3>
              </div>
              <div className="space-y-2">
                {QUICK_ACTIONS.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                  >
                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{label}</span>
                    <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </a>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold text-gray-700 text-sm">Recent Activity</h3>
              </div>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <BarChart2 className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">No activity yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload a document or generate a report to get started.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
