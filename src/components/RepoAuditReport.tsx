import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink, Code2, ShieldAlert, Sparkles } from 'lucide-react';
import { RepoVerificationReport } from '../types.ts';

export const RepoAuditReport: React.FC = () => {
  const [report, setReport] = useState<RepoVerificationReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/verify-report')
      .then((res) => res.json())
      .then((data) => setReport(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !report) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
        Loading repository verification report...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
            Technical Audit & Codebase Verification
          </span>
          <a
            href={report.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
          >
            <span>Prabhleen114/stock-verification</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <h1 className="text-2xl font-bold font-display text-slate-900">
          Repository Verification & Gap Analysis Report
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Detailed inspection of the GitHub repo's source code against your full specifications.
        </p>
      </div>

      {/* Summary Scorecard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <span>Repository Verdict: Incomplete</span>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700">
            {report.passRate}
          </div>
          <p className="text-xs text-rose-700 leading-relaxed">
            The original repo provides a raw backend scraper script, but fails 5 of the 7 user requirements.
          </p>
        </div>

        <div className="p-6 bg-slate-900 text-white rounded-xl space-y-2 md:col-span-2">
          <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
            <Code2 className="w-5 h-5 text-indigo-400" />
            <span>Files Analyzed in Cloned Repository</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {report.analyzedFiles.map((f, i) => (
              <span
                key={i}
                className="font-mono text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded text-slate-200"
              >
                {f}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pt-1">
            {report.summary}
          </p>
        </div>
      </div>

      {/* Detailed Requirement by Requirement Audit Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            Requirement Compliance Matrix
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Comparison between what was in Prabhleen114/stock-verification vs the complete solution built here.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4 w-1/4">Requirement</th>
                <th className="py-3 px-4 w-28">Repo Status</th>
                <th className="py-3 px-4 w-1/3">Original Repo Finding</th>
                <th className="py-3 px-4">Our Implemented Solution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900 align-top">
                    {item.requirement}
                  </td>

                  <td className="py-3 px-4 align-top whitespace-nowrap">
                    {item.repoStatus === 'PASS' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Pass</span>
                      </span>
                    )}
                    {item.repoStatus === 'PARTIAL' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Partial</span>
                      </span>
                    )}
                    {item.repoStatus === 'FAIL' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Missing</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-slate-600 leading-relaxed align-top">
                    {item.repoDetails}
                  </td>

                  <td className="py-3 px-4 text-slate-800 font-medium leading-relaxed align-top bg-emerald-50/20">
                    {item.currentSolution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engineering Takeaways Box */}
      <div className="p-6 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
        <span className="font-bold text-slate-900 block text-sm">
          Summary of Key Enhancements Added in this App:
        </span>
        <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
          <li>
            <strong>Real Fuzzy Matching Engine:</strong> Implemented Levenshtein distance & Token Dice coefficient algorithms. The original repo had only strict string key lookup which broke on slight phrasing differences.
          </li>
          <li>
            <strong>AI-Powered Intake (Gemini 3.8 Flash):</strong> Automatically strips vendor keywords ("Vedini", "Jindeal") and model codes, formats clean titles, generates categories, descriptions, and tags.
          </li>
          <li>
            <strong>Automatic 40% Profit Margin:</strong> Fixed missing price parsing in Cheerio, and calculates <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">Math.round(supplierPrice * 1.4)</code> to ensure consistent profit on new catalog items.
          </li>
          <li>
            <strong>Dynamic Storefront UI/UX:</strong> Added full customer-facing store with PDP purchase module that converts "Add to Cart" and "Buy Now" into disabled "Out of Stock" states with restock alerts.
          </li>
        </ul>
      </div>
    </div>
  );
};
