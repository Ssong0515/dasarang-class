import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ClassroomLoadDiagnostics } from '../types';

interface ClassroomDiagnosticsBannerProps {
  diagnostics?: ClassroomLoadDiagnostics;
  isDev: boolean;
  className?: string;
}

const getBannerTone = (diagnostics: ClassroomLoadDiagnostics) => {
  if (diagnostics.lastError || diagnostics.status === 'error') {
    return 'error';
  }

  if (diagnostics.countMismatch || diagnostics.studentSchemaIssueCount > 0) {
    return 'warning';
  }

  return 'neutral';
};

export const ClassroomDiagnosticsBanner: React.FC<ClassroomDiagnosticsBannerProps> = ({
  diagnostics,
  isDev,
  className = '',
}) => {
  if (
    !diagnostics ||
    diagnostics.status === 'empty' ||
    !(
      isDev ||
      diagnostics.countMismatch ||
      diagnostics.studentSchemaIssueCount > 0 ||
      Boolean(diagnostics.lastError)
    )
  ) {
    return null;
  }

  const tone = getBannerTone(diagnostics);
  const isNeutral = tone === 'neutral';
  const wrapperClassName =
    tone === 'error'
      ? 'border-[#F3D1CD] bg-[#FFF6F4] text-[#8A2C23]'
      : tone === 'warning'
        ? 'border-[#E9D7B1] bg-[#FFF9ED] text-[#8A5A13]'
        : 'border-[#D6E3F0] bg-[#F7FBFF] text-[#48617A]';
  const titleClassName = isNeutral ? 'text-[#2B4B68]' : 'text-[#4A3728]';
  const detailClassName = isNeutral ? 'text-[#5A728B]' : 'text-[#8B7E74]';
  const Icon = isNeutral ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`rounded-[28px] border px-5 py-4 text-sm shadow-sm ${wrapperClassName} ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <Icon size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className={`font-bold ${titleClassName}`}>Firestore classroom diagnostics</p>
          <p className="mt-1">
            status={diagnostics.status}, snapshot={diagnostics.snapshotCount ?? 'pending'}, oneShot=
            {diagnostics.oneShotCount ?? 'pending'}
          </p>
          {isNeutral && (
            <p className={`mt-1 ${detailClassName}`}>
              Classroom reads look healthy in this browser.
            </p>
          )}
          {diagnostics.countMismatch && (
            <p className="mt-1">Snapshot count and one-shot count do not match.</p>
          )}
          {diagnostics.studentSchemaIssueMessage && (
            <p className="mt-1">{diagnostics.studentSchemaIssueMessage}</p>
          )}
          {diagnostics.lastError && (
            <p className="mt-1 break-all text-[#B42318]">{diagnostics.lastError}</p>
          )}
          {isDev && (
            <p className={`mt-1 break-all text-xs ${detailClassName}`}>
              configured DB: {diagnostics.configuredDatabaseId} / resolved DB:{' '}
              {diagnostics.resolvedDatabaseId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
