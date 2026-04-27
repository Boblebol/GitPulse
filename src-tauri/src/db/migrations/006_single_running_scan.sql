-- Enforce one active indexing job at a time across the local database.
CREATE UNIQUE INDEX idx_scan_runs_single_running
ON scan_runs(status)
WHERE status = 'running';
