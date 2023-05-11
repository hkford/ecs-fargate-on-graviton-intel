import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_ecs as ecs,
    aws_iam as iam,
    aws_logs as logs,
    aws_elasticloadbalancingv2 as elbv2,
} from 'aws-cdk-lib';

interface ecsServiceStackProps extends StackProps {
    cluster: ecs.Cluster;
    imageRepository: ecr.Repository;
    ecsServiceSG: ec2.SecurityGroup;
    taskRole: iam.Role;
    taskExecutionRole: iam.Role;
    x86ServiceLogGroup: logs.LogGroup;
    arm64ServiceLogGroup: logs.LogGroup;
    x86TargetGroup: elbv2.ApplicationTargetGroup;
    arm64TargetGroup: elbv2.ApplicationTargetGroup;
}

export class EcsServiceStack extends Stack {
    constructor(scope: Construct, id: string, props: ecsServiceStackProps) {
        super(scope, id, props);
        new EcsServiceAddTarget(this, 'X86ServiceTarget', {
            identifier: "X86",
            architecture: ecs.CpuArchitecture.X86_64,
            cluster: props.cluster,
            imageRepository: props.imageRepository,
            ecsServiceSG: props.ecsServiceSG,
            taskRole: props.taskRole,
            taskExecutionRole: props.taskExecutionRole,
            logGroup: props.x86ServiceLogGroup,
            targetGroup: props.x86TargetGroup,
        });

        new EcsServiceAddTarget(this, 'Arm64ServiceTarget', {
            identifier: "Arm64",
            architecture: ecs.CpuArchitecture.ARM64,
            cluster: props.cluster,
            imageRepository: props.imageRepository,
            ecsServiceSG: props.ecsServiceSG,
            taskRole: props.taskRole,
            taskExecutionRole: props.taskExecutionRole,
            logGroup: props.arm64ServiceLogGroup,
            targetGroup: props.arm64TargetGroup,
        });
    }
}

interface EcsServiceAddTargetProps {
    identifier: string,
    architecture: ecs.CpuArchitecture,
    cluster: ecs.Cluster;
    imageRepository: ecr.Repository;
    ecsServiceSG: ec2.SecurityGroup;
    taskRole: iam.Role;
    taskExecutionRole: iam.Role;
    logGroup: logs.LogGroup;
    targetGroup: elbv2.ApplicationTargetGroup;
}

class EcsServiceAddTarget extends Construct {
    constructor(scope: Construct, id: string, props: EcsServiceAddTargetProps) {
        super(scope, id);
        const taskDefinition = new ecs.FargateTaskDefinition(
            this,
            `${props.identifier}TaskDefinition`,
            {
                memoryLimitMiB: 512,
                cpu: 256,
                executionRole: props.taskExecutionRole,
                runtimePlatform: {
                    operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
                    cpuArchitecture: props.architecture
                },
                taskRole: props.taskRole,
            }
        );

        const frontendImage = new ecs.AssetImage('frontend');

        taskDefinition.addContainer(`${props.identifier}Container`, {
            image: new ecs.EcrImage(props.imageRepository, "v1"),
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: props.identifier,
                logGroup: props.logGroup,
            }),
            portMappings: [
                {
                    containerPort: 3000,
                    protocol: ecs.Protocol.TCP,
                },
            ],

        });

        const service = new ecs.FargateService(
            this,
            `${props.identifier}Service`,
            {
                cluster: props.cluster,
                desiredCount: 1,
                assignPublicIp: false,
                taskDefinition: taskDefinition,
                enableExecuteCommand: true,
                securityGroups: [props.ecsServiceSG],
            }
        );

        props.targetGroup.addTarget(service);
    }
}
