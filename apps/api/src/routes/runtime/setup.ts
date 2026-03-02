/**
 * Runtime Observation Setup Endpoints
 * 
 * Provides infrastructure-as-code generation and setup utilities for runtime observations.
 * Enables customers to easily configure CloudTrail, GCP Audit Logs, and Database Query Logs.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/db.js';

const router = Router();

const API_URL = process.env.API_URL || 'https://api.vertaai.com';

/**
 * POST /api/runtime/setup/test-connection
 * Test connection to runtime observation webhook
 */
router.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const { workspaceId, source } = req.body;
    
    if (!workspaceId || !source) {
      return res.status(400).json({ error: 'workspaceId and source are required' });
    }
    
    // Check if we have received any observations for this workspace in the last 5 minutes
    const recentObservations = await prisma.runtimeCapabilityObservation.findMany({
      where: {
        workspaceId,
        source,
        observedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
      take: 1,
    });
    
    if (recentObservations.length > 0) {
      res.status(200).json({
        success: true,
        connected: true,
        message: `Successfully receiving ${source} events`,
        lastObservation: recentObservations[0].observedAt,
      });
    } else {
      res.status(200).json({
        success: true,
        connected: false,
        message: `No ${source} events received in the last 5 minutes. Please check your configuration.`,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/runtime/setup/status/:workspaceId
 * Get setup status for all runtime observation sources
 */
router.get('/status/:workspaceId', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    
    // Check for observations from each source in the last 24 hours
    const sources = ['aws_cloudtrail', 'gcp_audit_log', 'database_query_log'];
    const status: Record<string, any> = {};
    
    for (const source of sources) {
      const recentObservations = await prisma.runtimeCapabilityObservation.findMany({
        where: {
          workspaceId,
          source,
          observedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        orderBy: {
          observedAt: 'desc',
        },
        take: 1,
      });
      
      status[source] = {
        connected: recentObservations.length > 0,
        lastObservation: recentObservations[0]?.observedAt || null,
        observationCount: await prisma.runtimeCapabilityObservation.count({
          where: {
            workspaceId,
            source,
          },
        }),
      };
    }
    
    res.status(200).json({
      success: true,
      workspaceId,
      status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/runtime/setup/instructions/:source
 * Get setup instructions for a specific source
 */
router.get('/instructions/:source', async (req: Request, res: Response) => {
  try {
    const { source } = req.params;
    const { workspaceId } = req.query;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }
    
    const instructions: Record<string, any> = {
      aws_cloudtrail: {
        title: 'AWS CloudTrail Setup',
        description: 'Stream AWS API calls to VertaAI for runtime capability tracking',
        webhookUrl: `${API_URL}/api/runtime/cloudtrail`,
      },
      gcp_audit_log: {
        title: 'GCP Audit Log Setup',
        description: 'Stream GCP Audit Logs to VertaAI for runtime capability tracking',
        webhookUrl: `${API_URL}/api/runtime/gcp-audit`,
      },
      database_query_log: {
        title: 'Database Query Log Setup',
        description: 'Stream database query logs to VertaAI for runtime capability tracking',
        webhookUrl: `${API_URL}/api/runtime/database-query-log`,
      },
    };
    
    const sourceInstructions = instructions[source];
    
    if (!sourceInstructions) {
      return res.status(404).json({ error: `Unknown source: ${source}` });
    }
    
    res.status(200).json({
      success: true,
      ...sourceInstructions,
      workspaceId,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/runtime/setup/terraform/cloudtrail
 * Generate Terraform module for AWS CloudTrail integration
 */
router.post('/terraform/cloudtrail', async (req: Request, res: Response) => {
  try {
    const { workspaceId, awsRegion = 'us-east-1', trailName } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const webhookUrl = `${API_URL}/api/runtime/cloudtrail`;
    const snsTopicName = `vertaai-cloudtrail-${workspaceId}`;
    const finalTrailName = trailName || `vertaai-trail-${workspaceId}`;

    const terraformModule = `# VertaAI CloudTrail Integration
# Generated for workspace: ${workspaceId}
# This Terraform module creates the necessary AWS resources to stream CloudTrail events to VertaAI

variable "workspace_id" {
  description = "VertaAI workspace ID"
  type        = string
  default     = "${workspaceId}"
}

variable "aws_region" {
  description = "AWS region for CloudTrail"
  type        = string
  default     = "${awsRegion}"
}

# S3 bucket for CloudTrail logs
resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "vertaai-cloudtrail-\${var.workspace_id}"

  tags = {
    Name        = "VertaAI CloudTrail Logs"
    WorkspaceId = var.workspace_id
  }
}

resource "aws_s3_bucket_policy" "cloudtrail_logs_policy" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail_logs.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "\${aws_s3_bucket.cloudtrail_logs.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

# SNS topic for CloudTrail notifications
resource "aws_sns_topic" "cloudtrail_notifications" {
  name = "${snsTopicName}"

  tags = {
    Name        = "VertaAI CloudTrail Notifications"
    WorkspaceId = var.workspace_id
  }
}

resource "aws_sns_topic_policy" "cloudtrail_notifications_policy" {
  arn = aws_sns_topic.cloudtrail_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailSNSPolicy"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.cloudtrail_notifications.arn
      }
    ]
  })
}

# SNS subscription to VertaAI webhook
resource "aws_sns_topic_subscription" "vertaai_webhook" {
  topic_arn = aws_sns_topic.cloudtrail_notifications.arn
  protocol  = "https"
  endpoint  = "${webhookUrl}"
}

# CloudTrail
resource "aws_cloudtrail" "vertaai_trail" {
  name                          = "${finalTrailName}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_logging                = true
  sns_topic_name                = aws_sns_topic.cloudtrail_notifications.name

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = {
    Name        = "VertaAI CloudTrail"
    WorkspaceId = var.workspace_id
  }

  depends_on = [
    aws_s3_bucket_policy.cloudtrail_logs_policy,
    aws_sns_topic_policy.cloudtrail_notifications_policy
  ]
}

output "cloudtrail_arn" {
  description = "ARN of the CloudTrail trail"
  value       = aws_cloudtrail.vertaai_trail.arn
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic"
  value       = aws_sns_topic.cloudtrail_notifications.arn
}

output "webhook_url" {
  description = "VertaAI webhook URL"
  value       = "${webhookUrl}"
}
`;

    res.status(200).json({
      success: true,
      terraformModule,
      instructions: [
        '1. Save the Terraform module to a file (e.g., vertaai-cloudtrail.tf)',
        '2. Run: terraform init',
        '3. Run: terraform plan',
        '4. Run: terraform apply',
        '5. Test the connection using POST /api/runtime/setup/test-connection',
      ],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/runtime/setup/cloudformation/cloudtrail
 * Generate CloudFormation template for AWS CloudTrail integration
 */
router.post('/cloudformation/cloudtrail', async (req: Request, res: Response) => {
  try {
    const { workspaceId, awsRegion = 'us-east-1', trailName } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const webhookUrl = `${API_URL}/api/runtime/cloudtrail`;
    const snsTopicName = `vertaai-cloudtrail-${workspaceId}`;
    const finalTrailName = trailName || `vertaai-trail-${workspaceId}`;

    const cloudFormationTemplate = `AWSTemplateFormatVersion: '2010-09-09'
Description: VertaAI CloudTrail Integration for workspace ${workspaceId}

Parameters:
  WorkspaceId:
    Type: String
    Default: ${workspaceId}
    Description: VertaAI workspace ID

  AWSRegion:
    Type: String
    Default: ${awsRegion}
    Description: AWS region for CloudTrail

Resources:
  # S3 bucket for CloudTrail logs
  CloudTrailLogsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'vertaai-cloudtrail-\${WorkspaceId}'
      Tags:
        - Key: Name
          Value: VertaAI CloudTrail Logs
        - Key: WorkspaceId
          Value: !Ref WorkspaceId

  CloudTrailLogsBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref CloudTrailLogsBucket
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: AWSCloudTrailAclCheck
            Effect: Allow
            Principal:
              Service: cloudtrail.amazonaws.com
            Action: 's3:GetBucketAcl'
            Resource: !GetAtt CloudTrailLogsBucket.Arn
          - Sid: AWSCloudTrailWrite
            Effect: Allow
            Principal:
              Service: cloudtrail.amazonaws.com
            Action: 's3:PutObject'
            Resource: !Sub '\${CloudTrailLogsBucket.Arn}/*'
            Condition:
              StringEquals:
                's3:x-amz-acl': 'bucket-owner-full-control'

  # SNS topic for CloudTrail notifications
  CloudTrailNotificationsTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: ${snsTopicName}
      Tags:
        - Key: Name
          Value: VertaAI CloudTrail Notifications
        - Key: WorkspaceId
          Value: !Ref WorkspaceId

  CloudTrailNotificationsTopicPolicy:
    Type: AWS::SNS::TopicPolicy
    Properties:
      Topics:
        - !Ref CloudTrailNotificationsTopic
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: AWSCloudTrailSNSPolicy
            Effect: Allow
            Principal:
              Service: cloudtrail.amazonaws.com
            Action: 'SNS:Publish'
            Resource: !Ref CloudTrailNotificationsTopic

  # SNS subscription to VertaAI webhook
  VertaAIWebhookSubscription:
    Type: AWS::SNS::Subscription
    Properties:
      Protocol: https
      TopicArn: !Ref CloudTrailNotificationsTopic
      Endpoint: ${webhookUrl}

  # CloudTrail
  VertaAICloudTrail:
    Type: AWS::CloudTrail::Trail
    DependsOn:
      - CloudTrailLogsBucketPolicy
      - CloudTrailNotificationsTopicPolicy
    Properties:
      TrailName: ${finalTrailName}
      S3BucketName: !Ref CloudTrailLogsBucket
      IncludeGlobalServiceEvents: true
      IsMultiRegionTrail: true
      IsLogging: true
      SnsTopicName: !GetAtt CloudTrailNotificationsTopic.TopicName
      EventSelectors:
        - ReadWriteType: All
          IncludeManagementEvents: true
      Tags:
        - Key: Name
          Value: VertaAI CloudTrail
        - Key: WorkspaceId
          Value: !Ref WorkspaceId

Outputs:
  CloudTrailArn:
    Description: ARN of the CloudTrail trail
    Value: !GetAtt VertaAICloudTrail.Arn

  SNSTopicArn:
    Description: ARN of the SNS topic
    Value: !Ref CloudTrailNotificationsTopic

  WebhookUrl:
    Description: VertaAI webhook URL
    Value: ${webhookUrl}
`;

    res.status(200).json({
      success: true,
      cloudFormationTemplate,
      instructions: [
        '1. Save the CloudFormation template to a file (e.g., vertaai-cloudtrail.yaml)',
        '2. Go to AWS Console → CloudFormation → Create Stack',
        '3. Upload the template file',
        '4. Review and create the stack',
        '5. Test the connection using POST /api/runtime/setup/test-connection',
      ],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/runtime/setup/terraform/gcp-audit
 * Generate Terraform module for GCP Audit Log integration
 */
router.post('/terraform/gcp-audit', async (req: Request, res: Response) => {
  try {
    const { workspaceId, gcpProject, gcpRegion = 'us-central1' } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    if (!gcpProject) {
      return res.status(400).json({ error: 'gcpProject is required' });
    }

    const webhookUrl = `${API_URL}/api/runtime/gcp-audit`;
    const topicName = `vertaai-audit-${workspaceId}`;
    const subscriptionName = `vertaai-audit-sub-${workspaceId}`;
    const sinkName = `vertaai-audit-sink-${workspaceId}`;

    const terraformModule = `# VertaAI GCP Audit Log Integration
# Generated for workspace: ${workspaceId}
# This Terraform module creates the necessary GCP resources to stream Audit Logs to VertaAI

variable "workspace_id" {
  description = "VertaAI workspace ID"
  type        = string
  default     = "${workspaceId}"
}

variable "gcp_project" {
  description = "GCP project ID"
  type        = string
  default     = "${gcpProject}"
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "${gcpRegion}"
}

# Pub/Sub topic for Audit Logs
resource "google_pubsub_topic" "audit_logs" {
  name    = "${topicName}"
  project = var.gcp_project

  labels = {
    workspace_id = var.workspace_id
    managed_by   = "vertaai"
  }
}

# Pub/Sub subscription with push to VertaAI webhook
resource "google_pubsub_subscription" "vertaai_webhook" {
  name    = "${subscriptionName}"
  topic   = google_pubsub_topic.audit_logs.name
  project = var.gcp_project

  push_config {
    push_endpoint = "${webhookUrl}"
  }

  ack_deadline_seconds = 20

  labels = {
    workspace_id = var.workspace_id
    managed_by   = "vertaai"
  }
}

# Logging sink to route Audit Logs to Pub/Sub
resource "google_logging_project_sink" "audit_logs_sink" {
  name    = "${sinkName}"
  project = var.gcp_project

  destination = "pubsub.googleapis.com/projects/\${var.gcp_project}/topics/\${google_pubsub_topic.audit_logs.name}"

  # Filter for all Audit Logs
  filter = <<-EOT
    logName:"cloudaudit.googleapis.com"
  EOT

  unique_writer_identity = true
}

# Grant Pub/Sub Publisher role to the sink's writer identity
resource "google_pubsub_topic_iam_member" "sink_publisher" {
  project = var.gcp_project
  topic   = google_pubsub_topic.audit_logs.name
  role    = "roles/pubsub.publisher"
  member  = google_logging_project_sink.audit_logs_sink.writer_identity
}

output "topic_name" {
  description = "Name of the Pub/Sub topic"
  value       = google_pubsub_topic.audit_logs.name
}

output "subscription_name" {
  description = "Name of the Pub/Sub subscription"
  value       = google_pubsub_subscription.vertaai_webhook.name
}

output "sink_name" {
  description = "Name of the logging sink"
  value       = google_logging_project_sink.audit_logs_sink.name
}

output "webhook_url" {
  description = "VertaAI webhook URL"
  value       = "${webhookUrl}"
}
`;

    res.status(200).json({
      success: true,
      terraformModule,
      instructions: [
        '1. Save the Terraform module to a file (e.g., vertaai-gcp-audit.tf)',
        '2. Run: terraform init',
        '3. Run: terraform plan',
        '4. Run: terraform apply',
        '5. Test the connection using POST /api/runtime/setup/test-connection',
      ],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

