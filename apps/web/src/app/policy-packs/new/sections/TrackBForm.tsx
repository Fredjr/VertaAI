'use client';

interface TrackBFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function TrackBForm({ formData, setFormData }: TrackBFormProps) {
  const trackBConfig = formData.trackBConfig || {};

  const updateTrackBConfig = (updates: any) => {
    setFormData({
      ...formData,
      trackBConfig: {
        ...trackBConfig,
        ...updates,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Enable Track B */}
      <div className="flex items-center justify-between p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Track B: Drift Remediation
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Automatically detect and remediate documentation drift
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.trackBEnabled}
            onChange={(e) => setFormData({ ...formData, trackBEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:peer-focus:ring-cyan-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div>
        </label>
      </div>

      {!formData.trackBEnabled && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Enable Track B to configure drift remediation settings
        </div>
      )}

      {formData.trackBEnabled && (
        <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Track B Configuration:</strong> Full configuration UI for drift remediation will be available in the next iteration.
              For now, you can enable Track B and configure it via API or database directly.
            </p>
          </div>

          {/* Primary Doc Class */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Primary Document Class
            </label>
            <select
              value={trackBConfig.primaryDoc?.class || 'runbook'}
              onChange={(e) => updateTrackBConfig({
                primaryDoc: { ...trackBConfig.primaryDoc, class: e.target.value }
              })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="runbook">Runbook</option>
              <option value="architecture">Architecture</option>
              <option value="api_docs">API Documentation</option>
              <option value="onboarding">Onboarding Guide</option>
            </select>
          </div>

          {/* Input Sources */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Input Sources
            </label>
            <div className="space-y-2">
              {['github_pr', 'pagerduty_incident', 'slack_cluster', 'datadog_alert', 'grafana_alert'].map((source) => (
                <label key={source} className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={(trackBConfig.inputSources || []).includes(source)}
                    onChange={(e) => {
                      const sources = trackBConfig.inputSources || [];
                      updateTrackBConfig({
                        inputSources: e.target.checked
                          ? [...sources, source]
                          : sources.filter((s: string) => s !== source),
                      });
                    }}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {source.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Drift Types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Drift Types to Detect
            </label>
            <div className="space-y-2">
              {['instruction', 'process', 'ownership', 'coverage', 'environment_tooling'].map((type) => (
                <label key={type} className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={(trackBConfig.driftTypes || []).includes(type)}
                    onChange={(e) => {
                      const types = trackBConfig.driftTypes || [];
                      updateTrackBConfig({
                        driftTypes: e.target.checked
                          ? [...types, type]
                          : types.filter((t: string) => t !== type),
                      });
                    }}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {type.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
