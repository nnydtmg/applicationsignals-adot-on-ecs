#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import * as dotenv from 'dotenv';
dotenv.config();

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
const APP_TAG = process.env.APP_TAG || 'latest';
const ADOT_TAG = process.env.ADOT_TAG || 'latest';

const app = new cdk.App();
new CdkStack(app, 'CdkStack', {
  env: {
    region: AWS_REGION,
  },
});