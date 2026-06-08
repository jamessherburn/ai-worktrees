import { useEffect } from 'react';
import { GitHubMonitorWidget } from './GitHubMonitorWidget';

type Props = {
  repoPathsKey: string;
  onClose: () => void;
};

export function GitHubStatsModal({ repoPathsKey, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal-wide modal-stats" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">GitHub Stats</div>
          <div className="modal-subtitle">
            Merged PRs, commits, approvals, and review comments across your session repos
          </div>
        </div>
        <div className="modal-body modal-stats-body">
          <GitHubMonitorWidget repoPathsKey={repoPathsKey} embedded />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
