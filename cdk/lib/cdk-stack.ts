import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new cdk.aws_ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2, // Default is all AZs in the region
      natGateways: 1, // Number of NAT gateways
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });
  }
}
