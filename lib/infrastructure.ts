import { Stack, StackProps, Tags, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_ecs as ecs,
    aws_iam as iam,
    aws_logs as logs,
    aws_elasticloadbalancingv2 as elbv2,
} from 'aws-cdk-lib';

export class InfrastructureStack extends Stack {
    public readonly cluster: ecs.Cluster;
    public readonly imageRepository: ecr.Repository;
    public readonly ecsServiceSG: ec2.SecurityGroup;
    public readonly taskRole: iam.Role;
    public readonly taskExecutionRole: iam.Role;
    public readonly x86ServiceLogGroup: logs.LogGroup;
    public readonly arm64ServiceLogGroup: logs.LogGroup;
    public readonly x86TargetGroup: elbv2.ApplicationTargetGroup;
    public readonly arm64TargetGroup: elbv2.ApplicationTargetGroup;
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);
        const vpc = new ec2.Vpc(this, 'VPC', {
            cidr: '10.0.0.0/16',
            enableDnsHostnames: true,
            enableDnsSupport: true,
        });
        Tags.of(vpc).add('Name', 'CDKECSVPC');

        this.cluster = new ecs.Cluster(this, 'ECSCluster', {
            vpc: vpc,
        });

        const albSG = new ec2.SecurityGroup(this, 'ALBSG', {
            securityGroupName: 'ALBSG',
            vpc: vpc,
        });
        albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

        this.ecsServiceSG = new ec2.SecurityGroup(
            this,
            'EcsServiceSG',
            {
                securityGroupName: 'ecsServiceSecurityGroup',
                vpc: vpc,
            }
        );

        this.ecsServiceSG.addIngressRule(albSG, ec2.Port.allTcp());

        this.imageRepository = new ecr.Repository(this, "ImageRepository", {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteImages: true
        });

        const ECSExecPolicyStatement = new iam.PolicyStatement({
            sid: 'allowECSExec',
            resources: ['*'],
            actions: [
                'ssmmessages:CreateControlChannel',
                'ssmmessages:CreateDataChannel',
                'ssmmessages:OpenControlChannel',
                'ssmmessages:OpenDataChannel',
                'logs:CreateLogStream',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
                'logs:PutLogEvents',
            ],
        });

        this.taskRole = new iam.Role(this, 'TaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });
        this.taskRole.addToPolicy(ECSExecPolicyStatement);

        this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                {
                    managedPolicyArn:
                        'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
                },
            ],
        });

        this.x86ServiceLogGroup = new logs.LogGroup(this, 'X86ServiceLogGroup', {
            logGroupName: 'x86-service',
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.arm64ServiceLogGroup = new logs.LogGroup(this, 'Arm64ServiceLogGroup', {
            logGroupName: 'arm64-service',
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
            vpc: vpc,
            internetFacing: true,
            securityGroup: albSG,
            vpcSubnets: { subnets: vpc.publicSubnets },
        });

        const listener = alb.addListener('Listener', { port: 80 });

        this.x86TargetGroup = new elbv2.ApplicationTargetGroup(this, "X86TargetGroup", {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            healthCheck: {
                enabled: true,
                path: '/ishealthy',
                healthyHttpCodes: '200',
            },
            targetType: elbv2.TargetType.IP,
            vpc: vpc
        });
        this.arm64TargetGroup = new elbv2.ApplicationTargetGroup(this, "Arm64TargetGroup", {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            healthCheck: {
                enabled: true,
                path: '/ishealthy',
                healthyHttpCodes: '200',
            },
            targetType: elbv2.TargetType.IP,
            vpc: vpc
        });

        listener.addAction("DefaultAction", {
            action: elbv2.ListenerAction.fixedResponse(200, {
                contentType: 'text/plain',
                messageBody: 'Default Action',
            })
        });
        listener.addAction("ForwardToX86TargetGroup", {
            conditions: [
                elbv2.ListenerCondition.pathPatterns(["/x86"])
            ],
            action: elbv2.ListenerAction.forward([this.x86TargetGroup]),
            priority: 2
        });

        listener.addAction("ForwardToArm64TargetGroup", {
            conditions: [
                elbv2.ListenerCondition.pathPatterns(["/arm64"])
            ],
            action: elbv2.ListenerAction.forward([this.arm64TargetGroup]),
            priority: 3,
        });

        const stack = Stack.of(this);

        const region = stack.region;
        const accountId = stack.account;

        new CfnOutput(this, 'DockerLoginCommand', {
            value: `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${accountId}.dkr.ecr.${region}.amazonaws.com`
        })

        new CfnOutput(this, 'DockerBuildxPushCommand', {
            value: `docker buildx build --platform linux/arm64,linux/amd64 --tag ${this.imageRepository.repositoryUri}:v1 --push .`
        });

        new CfnOutput(this, 'DockerRunCommand', {
            value: `docker run --init -p 3000:3000 --rm ${this.imageRepository.repositoryUri}:v1`
        });
    }
}
