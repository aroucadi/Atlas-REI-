import { Injectable } from '@nestjs/common';

export interface RoutedModel {
  provider: string;
  model: string;
  temperature: number;
  costPerToken: number;
}

@Injectable()
export class ModelRouterService {
  selectModel(taskComplexity: 'high' | 'medium' | 'low'): RoutedModel {
    if (taskComplexity === 'high') {
      return {
        provider: 'google',
        model: 'gemini-1.5-pro',
        temperature: 0.0,
        costPerToken: 0.007,
      };
    }

    return {
      provider: 'google',
      model: 'gemini-1.5-flash',
      temperature: 0.2,
      costPerToken: 0.0015,
    };
  }
}
