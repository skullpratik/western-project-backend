import React, { useState, useEffect } from "react";
import { getActivityLogs, getActivityStats } from "../../api/user";

export function ActivityLog({ user }) {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [page, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await getActivityLogs({ ...filters, page, limit: 15 });
      setLogs(response.logs);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await getActivityStats();
      setStats(response);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const getActionColor = (action) => {
    const actionColors = {
      LOGIN: "#4caf50",
      LOGOUT: "#f44336",
      TEXTURE: "#ff9800",
      DOOR: "#2196f3",
      DRAWER: "#9c27b0",
      LIGHT: "#ffeb3b",
      PRESET: "#673ab7",
      ERROR: "#f44336",
      default: "#607d8b"
    };

    for (const [key, color] of Object.entries(actionColors)) {
      if (action.includes(key)) return color;
    }
    return actionColors.default;
  };

  if (loading) return <div className="loading">Loading activity logs...</div>;

  return (
    <div className="activity-log-container">
      <div className="activity-header">
        <h2>Activity History</h2>
        {user.role === "admin" && (
          <span className="user-role-badge">Admin View</span>
        )}
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="activity-stats">
          <div className="stat-card">
            <h3>{stats.totalActions}</h3>
            <p>Total Actions (30 days)</p>
          </div>
          <div className="stat-card">
            <h3>{stats.popularActions[0]?.count || 0}</h3>
            <p>{stats.popularActions[0]?._id || "No data"}</p>
          </div>
        </div>
      )}

      {/* Filters - Only for admin */}
      {user.role === "admin" && (
        <div className="activity-filters">
          <input
            type="text"
            placeholder="Filter by action..."
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          />
          <input
            type="date"
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            placeholder="Start date"
          />
          <input
            type="date"
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            placeholder="End date"
          />
        </div>
      )}

      {/* Activity List */}
      <div className="activity-list">
        {logs.map((log) => (
          <div key={log._id} className="activity-item">
            <div className="activity-header">
              <div className="action-badge" style={{ backgroundColor: getActionColor(log.action) }}>
                {log.action}
              </div>
              <span className="activity-time">{formatDate(log.timestamp)}</span>
            </div>
            
            <div className="activity-details">
              <div className="user-info">
                <strong>{log.userName}</strong>
                <span className="user-email">{log.userEmail}</span>
                {user.role === "admin" && (
                  <span className="ip-address">IP: {log.ipAddress}</span>
                )}
              </div>

              {(log.modelName || log.partName) && (
                <div className="model-info">
                  {log.modelName && <span>Model: {log.modelName}</span>}
                  {log.partName && <span>Part: {log.partName}</span>}
                </div>
              )}

              {log.details && Object.keys(log.details).length > 0 && (
                <div className="activity-details-json">
                  <details>
                    <summary>Details</summary>
                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            disabled={page <= 1} 
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          
          <span>Page {page} of {totalPages}</span>
          
          <button 
            disabled={page >= totalPages} 
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {logs.length === 0 && !loading && (
        <div className="no-activities">
          <p>No activities found</p>
        </div>
      )}
    </div>
  );
}