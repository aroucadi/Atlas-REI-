import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InvestorProfileService } from './investor-profile.service';
import { InvestorProfileController } from './investor-profile.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [InvestorProfileController],
  providers: [InvestorProfileService],
  exports: [InvestorProfileService],
})
export class InvestorProfileModule {}
