import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentSchedulerService } from './runtime';
import { BullModule } from '@nestjs/bullmq';
import { AgentQueueProcessor } from './agent-queue.processor';
import { DocumentModule } from '../document/document.module';
import { PromptRegistryService } from './prompt-registry.service';
import { PromptRegistryController } from './prompt-registry.controller';
import { GoalService } from './goal.service';
import { GoalController } from './goal.controller';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { KnowledgeGraphController } from './knowledge-graph.controller';
import { AgentMessageBrokerService } from './agent-message-broker.service';
import { ConsensusCoordinatorService } from './consensus-coordinator.service';
import { AgentMessagesController } from './agent-messages.controller';
import { BenchmarkRunnerService } from './benchmark-runner.service';
import { QualityGateController } from './quality-gate.controller';
import { AgentKernelService } from './agent-kernel.service';
import { SyscallHandlerService } from './syscall-handler.service';
import { AgentKernelController } from './agent-kernel.controller';
import { ModelRouterService } from './model-router.service';
import { PromptOptimizerService } from './prompt-optimizer.service';
import { SelfOptGovernanceController } from './self-opt-governance.controller';
import { InstitutionalOutcomeAnalyzerService } from './institutional-outcome-analyzer.service';
import { CrossGoalPatternExtractorService } from './cross-goal-pattern-extractor.service';
import { SecureAnonymizerService } from './secure-anonymizer.service';
import { OrganizationalIntelligenceController } from './organizational-intelligence.controller';
import { ReflectionEngine } from './runtime/reflection.engine';
import { ContinuousExecutionService } from './continuous-execution.service';
import { HumanEscalationController } from './human-escalation.controller';

@Module({
  imports: [
    DatabaseModule,
    DocumentModule,
    BullModule.registerQueue({
      name: 'agent-queue',
    }),
  ],
  controllers: [
    AgentController,
    PromptRegistryController,
    GoalController,
    KnowledgeGraphController,
    AgentMessagesController,
    QualityGateController,
    AgentKernelController,
    SelfOptGovernanceController,
    OrganizationalIntelligenceController,
    HumanEscalationController,
  ],
  providers: [
    AgentService,
    AgentSchedulerService,
    AgentQueueProcessor,
    PromptRegistryService,
    GoalService,
    KnowledgeGraphService,
    AgentMessageBrokerService,
    ConsensusCoordinatorService,
    BenchmarkRunnerService,
    AgentKernelService,
    SyscallHandlerService,
    ModelRouterService,
    PromptOptimizerService,
    InstitutionalOutcomeAnalyzerService,
    CrossGoalPatternExtractorService,
    SecureAnonymizerService,
    ReflectionEngine,
    ContinuousExecutionService,
  ],
  exports: [
    AgentService,
    AgentSchedulerService,
    PromptRegistryService,
    GoalService,
    KnowledgeGraphService,
    AgentMessageBrokerService,
    ConsensusCoordinatorService,
    BenchmarkRunnerService,
    AgentKernelService,
    SyscallHandlerService,
    ModelRouterService,
    PromptOptimizerService,
    InstitutionalOutcomeAnalyzerService,
    CrossGoalPatternExtractorService,
    SecureAnonymizerService,
    ReflectionEngine,
    ContinuousExecutionService,
  ],
})
export class AgentModule {}
