import { useState, useEffect } from 'react';
import { ProposalStatus } from '@/types';
import { proposalsApi } from '../api/proposals';

/**
 * Custom hook to poll proposal processing status
 * Polls the backend every 10 seconds until status is 'completed' or 'error'
 *
 * @param proposalId - The ID of the proposal to poll
 * @param interval - Polling interval in milliseconds (default: 10000ms / 10 seconds)
 * @returns Object containing status, isPolling flag, and error
 */
export function useProposalPolling(proposalId: string | null, interval = 10000) {
  const [status, setStatus] = useState<ProposalStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proposalId) return;

    setIsPolling(true);
    setError(null);

    // Initial fetch
    const fetchStatus = async () => {
      try {
        const statusData = await proposalsApi.getStatus(proposalId);
        setStatus(statusData);

        // Stop polling if completed or error
        if (statusData.status === 'completed' || statusData.status === 'error') {
          setIsPolling(false);
        }
      } catch (err: any) {
        // Only stop polling and show error if it's from backend
        // Network errors are silently ignored - we continue polling
        if (err.response) {
          // Backend error (4xx, 5xx) - stop polling and show error
          setError('backend: ' + (err.response?.data?.detail || 'Failed to fetch status'));
          setIsPolling(false);
        }
        // Network errors (timeout, connection) - keep polling
      }
    };

    // Fetch immediately
    fetchStatus();

    // Set up polling interval
    const pollInterval = setInterval(async () => {
      try {
        const statusData = await proposalsApi.getStatus(proposalId);
        setStatus(statusData);

        // Stop polling if completed or error
        if (statusData.status === 'completed' || statusData.status === 'error') {
          clearInterval(pollInterval);
          setIsPolling(false);
        }
      } catch (err: any) {
        // Only stop polling and show error if it's from backend
        // Network errors are silently ignored - we continue polling
        if (err.response) {
          // Backend error (4xx, 5xx) - stop polling and show error
          setError('backend: ' + (err.response?.data?.detail || 'Failed to fetch status'));
          clearInterval(pollInterval);
          setIsPolling(false);
        }
        // Network errors (timeout, connection) - keep polling
        // This ensures we keep trying even if there's a temporary network issue
      }
    }, interval);

    // Cleanup on unmount
    return () => {
      clearInterval(pollInterval);
      setIsPolling(false);
    };
  }, [proposalId, interval]);

  return { status, isPolling, error };
}
