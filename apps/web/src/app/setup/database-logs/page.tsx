'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DatabaseLogsSetupPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <DatabaseLogsSetupContent />
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
    </main>
  );
}

function DatabaseLogsSetupContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  
  const [databaseType, setDatabaseType] = useState<'postgresql' | 'mysql' | 'mongodb' | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message: string } | null>(null);

  if (!workspaceId) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: No workspace ID provided</p>
          </div>
        </div>
      </main>
    );
  }

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const response = await fetch(`${API_URL}/api/runtime/setup/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, source: 'database_query_log' }),
      });

      const data = await response.json();
      setConnectionStatus(data);
    } catch (error: any) {
      setConnectionStatus({ connected: false, message: `Error: ${error.message}` });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🗄️ Database Query Logs Setup</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Stream database query logs to VertaAI for data access pattern tracking
          </p>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          {!databaseType ? (
            <DatabaseTypeSelector onSelectType={setDatabaseType} />
          ) : (
            <>
              <ManualSetupGuide databaseType={databaseType} workspaceId={workspaceId} />
              
              <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-semibold mb-4">Test Connection</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Verify that VertaAI is receiving database query logs
                </p>

                <div className="mb-6">
                  <button
                    onClick={testConnection}
                    disabled={isTestingConnection}
                    className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTestingConnection ? 'Testing Connection...' : 'Test Connection'}
                  </button>
                </div>

                {connectionStatus && (
                  <div className={`p-4 rounded-lg border ${
                    connectionStatus.connected 
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{connectionStatus.connected ? '✅' : '⏳'}</span>
                      <div>
                        <h3 className="font-semibold mb-1">
                          {connectionStatus.connected ? 'Connection Successful!' : 'No Logs Received Yet'}
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{connectionStatus.message}</p>
                        {!connectionStatus.connected && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            Execute some database queries and test again.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {connectionStatus?.connected && (
                  <div className="mt-6">
                    <a
                      href={`/onboarding?workspace=${workspaceId}`}
                      className="block w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-center"
                    >
                      Complete Setup →
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

// Database Type Selector
interface DatabaseTypeSelectorProps {
  onSelectType: (type: 'postgresql' | 'mysql' | 'mongodb') => void;
}

function DatabaseTypeSelector({ onSelectType }: DatabaseTypeSelectorProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Choose Database Type</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Select your database type to see setup instructions
      </p>

      <div className="space-y-4">
        <DatabaseCard
          title="PostgreSQL"
          description="Stream PostgreSQL query logs using pg_stat_statements extension"
          icon="🐘"
          onClick={() => onSelectType('postgresql')}
        />

        <DatabaseCard
          title="MySQL"
          description="Stream MySQL query logs using general_log or slow_query_log"
          icon="🐬"
          onClick={() => onSelectType('mysql')}
        />

        <DatabaseCard
          title="MongoDB"
          description="Stream MongoDB query logs using profiler"
          icon="🍃"
          onClick={() => onSelectType('mongodb')}
        />
      </div>
    </div>
  );
}

interface DatabaseCardProps {
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
}

function DatabaseCard({ title, description, icon, onClick }: DatabaseCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 transition text-left"
    >
      <div className="flex items-start gap-4">
        <span className="text-4xl">{icon}</span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </button>
  );
}

// Manual Setup Guide
interface ManualSetupGuideProps {
  databaseType: 'postgresql' | 'mysql' | 'mongodb';
  workspaceId: string;
}

function ManualSetupGuide({ databaseType, workspaceId }: ManualSetupGuideProps) {
  const webhookUrl = `${API_URL}/api/runtime/database-query-log`;

  if (databaseType === 'postgresql') {
    return <PostgreSQLSetupGuide webhookUrl={webhookUrl} />;
  } else if (databaseType === 'mysql') {
    return <MySQLSetupGuide webhookUrl={webhookUrl} />;
  } else {
    return <MongoDBSetupGuide webhookUrl={webhookUrl} />;
  }
}

// PostgreSQL Setup Guide
function PostgreSQLSetupGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">🐘 PostgreSQL Setup</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Stream PostgreSQL query logs to VertaAI
      </p>

      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">📋 Prerequisites</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>PostgreSQL 9.2 or higher</li>
            <li>Superuser access to the database</li>
            <li>pg_stat_statements extension available</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 1: Enable pg_stat_statements</h3>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`-- Connect to your database
psql -U postgres -d your_database

-- Enable the extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify it's enabled
SELECT * FROM pg_stat_statements LIMIT 1;`}
          </pre>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 2: Configure postgresql.conf</h3>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`# Add to postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000

# Restart PostgreSQL
sudo systemctl restart postgresql`}
          </pre>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 3: Set up Log Streaming</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Install and configure the VertaAI log shipper:
          </p>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`# Install the log shipper
npm install -g @vertaai/log-shipper

# Configure the shipper
cat > vertaai-postgres.json << EOF
{
  "database": {
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "your_database",
    "user": "postgres",
    "password": "your_password"
  },
  "webhook": "${webhookUrl}",
  "pollInterval": 60000
}
EOF

# Run the shipper
vertaai-log-shipper --config vertaai-postgres.json`}
          </pre>
        </div>

        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">✅ Setup Complete!</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            PostgreSQL query logs will now be streamed to VertaAI. Execute some queries and test the connection.
          </p>
        </div>
      </div>
    </div>
  );
}

// MySQL Setup Guide
function MySQLSetupGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">🐬 MySQL Setup</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Stream MySQL query logs to VertaAI
      </p>

      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">📋 Prerequisites</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>MySQL 5.7 or higher</li>
            <li>Root or admin access to the database</li>
            <li>General log or slow query log enabled</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 1: Enable General Log</h3>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`-- Connect to MySQL
mysql -u root -p

-- Enable general log
SET GLOBAL general_log = 'ON';
SET GLOBAL log_output = 'TABLE';

-- Verify it's enabled
SHOW VARIABLES LIKE 'general_log';`}
          </pre>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 2: Set up Log Streaming</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Install and configure the VertaAI log shipper:
          </p>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`# Install the log shipper
npm install -g @vertaai/log-shipper

# Configure the shipper
cat > vertaai-mysql.json << EOF
{
  "database": {
    "type": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "mysql",
    "user": "root",
    "password": "your_password"
  },
  "webhook": "${webhookUrl}",
  "pollInterval": 60000
}
EOF

# Run the shipper
vertaai-log-shipper --config vertaai-mysql.json`}
          </pre>
        </div>

        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">✅ Setup Complete!</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            MySQL query logs will now be streamed to VertaAI. Execute some queries and test the connection.
          </p>
        </div>
      </div>
    </div>
  );
}

// MongoDB Setup Guide
function MongoDBSetupGuide({ webhookUrl }: { webhookUrl: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">🍃 MongoDB Setup</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Stream MongoDB query logs to VertaAI
      </p>

      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">📋 Prerequisites</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>MongoDB 4.0 or higher</li>
            <li>Admin access to the database</li>
            <li>Profiler enabled</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 1: Enable Profiler</h3>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`// Connect to MongoDB
mongosh

// Enable profiler (level 2 = all operations)
use your_database
db.setProfilingLevel(2)

// Verify it's enabled
db.getProfilingStatus()`}
          </pre>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 2: Set up Log Streaming</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Install and configure the VertaAI log shipper:
          </p>
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
{`# Install the log shipper
npm install -g @vertaai/log-shipper

# Configure the shipper
cat > vertaai-mongodb.json << EOF
{
  "database": {
    "type": "mongodb",
    "host": "localhost",
    "port": 27017,
    "database": "your_database",
    "user": "admin",
    "password": "your_password"
  },
  "webhook": "${webhookUrl}",
  "pollInterval": 60000
}
EOF

# Run the shipper
vertaai-log-shipper --config vertaai-mongodb.json`}
          </pre>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">⚠️ Performance Note</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Profiling level 2 can impact performance. For production, consider using level 1 (slow queries only) or sampling.
          </p>
        </div>

        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">✅ Setup Complete!</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            MongoDB query logs will now be streamed to VertaAI. Execute some queries and test the connection.
          </p>
        </div>
      </div>
    </div>
  );
}

