import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { UnderwriteModule } from './underwrite/underwrite.module';
import { CommitteeModule } from './committee/committee.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventModule } from './event/event.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { DocumentModule } from './document/document.module';
import { InvestorProfileModule } from './investor-profile/investor-profile.module';
import { DealFinderModule } from './deal-finder/deal-finder.module';
import { ShortlistModule } from './shortlist/shortlist.module';
import { EvidenceModule } from './evidence/evidence.module';
import { DailyBriefModule } from './daily-brief/daily-brief.module';
import { CopilotModule } from './copilot/copilot.module';
import { AgentModule } from './agent/agent.module';
import { BullModule } from '@nestjs/bullmq';
import { UnderwriteExportModule } from './exports/underwrite-export.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    }),
    DatabaseModule,
    AuthModule,
    WorkspaceModule,
    UnderwriteModule,
    CommitteeModule,
    EventModule,
    PortfolioModule,
    DocumentModule,
    InvestorProfileModule,
    DealFinderModule,
    ShortlistModule,
    EvidenceModule,
    DailyBriefModule,
    CopilotModule,
    AgentModule,
    UnderwriteExportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
