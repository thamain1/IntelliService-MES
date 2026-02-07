import { ReactNode } from 'react';
import { useFeature } from '../../hooks/useFeature';

interface FeatureGuardProps {
  /**
   * The feature key to check
   */
  featureKey: string;
  /**
   * Content to render when feature is enabled
   */
  children: ReactNode;
  /**
   * Content to render when feature is disabled (default: null)
   */
  fallback?: ReactNode;
  /**
   * Whether to show a loading spinner while checking (default: false)
   */
  showLoading?: boolean;
  /**
   * Custom loading component
   */
  loadingComponent?: ReactNode;
}

/**
 * FeatureGuard - Conditionally renders content based on feature flag status
 *
 * Usage:
 * <FeatureGuard featureKey="module_mes">
 *   <ProductionDashboard />
 * </FeatureGuard>
 *
 * With fallback:
 * <FeatureGuard featureKey="module_mes" fallback={<UpgradePrompt />}>
 *   <ProductionDashboard />
 * </FeatureGuard>
 */
export function FeatureGuard({
  featureKey,
  children,
  fallback = null,
  showLoading = false,
  loadingComponent,
}: FeatureGuardProps) {
  const { enabled, loading } = useFeature(featureKey);

  // Show loading state if requested
  if (loading && showLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // While loading, render nothing (unless showLoading is true)
  if (loading) {
    return null;
  }

  // Render children if feature is enabled, otherwise render fallback
  if (enabled) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * FeatureDisabled - Shows content only when a feature is disabled
 * Inverse of FeatureGuard
 */
export function FeatureDisabled({
  featureKey,
  children,
  showLoading = false,
}: {
  featureKey: string;
  children: ReactNode;
  showLoading?: boolean;
}) {
  const { enabled, loading } = useFeature(featureKey);

  if (loading && showLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (loading) {
    return null;
  }

  // Only render when feature is disabled
  if (!enabled) {
    return <>{children}</>;
  }

  return null;
}
