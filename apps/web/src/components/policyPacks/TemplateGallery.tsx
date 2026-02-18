'use client';

import { useState, useEffect } from 'react';
import { FileText, Eye, Download, Check } from 'lucide-react';

interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  ruleCount: number;
  packMode: string;
  strictness: string;
}

interface TemplateGalleryProps {
  workspaceId: string;
  onSelectTemplate: (templateYaml: string) => void;
  currentYaml?: string;
}

export default function TemplateGallery({ workspaceId, onSelectTemplate, currentYaml }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [previewYaml, setPreviewYaml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [workspaceId]);

  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/templates`);
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (templateId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/templates/${templateId}`);
      const data = await response.json();
      setPreviewYaml(data.template.yaml);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to load template:', error);
    }
  };

  const handleUseTemplate = async (templateId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/templates/${templateId}`);
      const data = await response.json();
      setSelectedTemplateId(templateId);
      onSelectTemplate(data.template.yaml);
    } catch (error) {
      console.error('Failed to load template:', error);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      observe: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      enforce: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      security: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      documentation: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      infrastructure: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      microservices: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-600 dark:text-gray-400">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Choose a Starter Template
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Start with a pre-built template and customize it to your needs
        </p>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`relative border rounded-lg p-4 hover:shadow-md transition-shadow ${
              selectedTemplateId === template.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
            }`}
          >
            {/* Selected Badge */}
            {selectedTemplateId === template.id && (
              <div className="absolute top-2 right-2">
                <div className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                  <Check className="h-3 w-3" />
                  <span>Selected</span>
                </div>
              </div>
            )}

            {/* Template Header */}
            <div className="mb-3">
              <div className="flex items-start justify-between mb-2">
                <FileText className="h-5 w-5 text-gray-400" />
                <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(template.category)}`}>
                  {template.category}
                </span>
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white">{template.name}</h4>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
              {template.description}
            </p>

            {/* Metadata */}
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
              <span>{template.ruleCount} rules</span>
              <span>•</span>
              <span className="capitalize">{template.packMode}</span>
              <span>•</span>
              <span className="capitalize">{template.strictness}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handlePreview(template.id)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
              <button
                onClick={() => handleUseTemplate(template.id)}
                className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Use Template
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {showPreview && previewYaml && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Template Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                {previewYaml}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

