if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'CRITICAL SECURITY FAILURE: NODE_ENV must be set to "test" for E2E tests.',
  );
}
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'CRITICAL SECURITY FAILURE: TEST_DATABASE_URL environment variable is missing.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.DATABASE_URL.toLowerCase().includes('test')) {
  throw new Error(
    `CRITICAL SECURITY FAILURE: DATABASE_URL "${process.env.DATABASE_URL}" does not contain the word "test".`,
  );
}
if (!process.env.JWT_SECRET) {
  throw new Error(
    'CRITICAL SECURITY FAILURE: JWT_SECRET environment variable is missing.',
  );
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
