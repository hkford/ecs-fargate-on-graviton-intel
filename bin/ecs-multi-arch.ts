#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsServiceStack } from '../lib/ecs-services';
import { InfrastructureStack } from '../lib/infrastructure';

const app = new cdk.App();

const infrastructure = new InfrastructureStack(app, 'ECSInfrastructureStack', {
    env: { region: 'us-east-1' },
});
new EcsServiceStack(app, 'ECSServiceStack', {
    env: { region: 'us-east-1' },
    cluster: infrastructure.cluster,
    imageRepository: infrastructure.imageRepository,
    ecsServiceSG: infrastructure.ecsServiceSG,
    taskRole: infrastructure.taskRole,
    taskExecutionRole: infrastructure.taskExecutionRole,
    x86ServiceLogGroup: infrastructure.x86ServiceLogGroup,
    arm64ServiceLogGroup: infrastructure.arm64ServiceLogGroup,
    x86TargetGroup: infrastructure.x86TargetGroup,
    arm64TargetGroup: infrastructure.arm64TargetGroup,
});