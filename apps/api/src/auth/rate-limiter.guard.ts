import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RateLimiterGuard implements CanActivate, OnApplicationShutdown {
  private readonly redis: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.redis.on('error', () => {
      // Quiet warning for local test environments
      console.warn(
        'Redis rate limiter connection error, using memory fallback',
      );
    });
  }

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => {});
  }

  private localIpCache = new Map<
    string,
    { count: number; resetTime: number }
  >();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';

    const limit = 20; // 20 requests per minute
    const windowSec = 60;

    let currentCount = 0;

    if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
      try {
        const key = `rate-limit:${ip}`;
        const multi = this.redis.multi();
        multi.incr(key);
        multi.ttl(key);
        const results = await multi.exec();

        if (results && results[0] && results[1]) {
          const count = results[0][1] as number;
          const ttl = results[1][1] as number;

          if (count === 1 || ttl === -1) {
            await this.redis.expire(key, windowSec);
          }
          currentCount = count;
        }
      } catch {
        currentCount = this.localFallback(ip, limit, windowSec * 1000);
      }
    } else {
      currentCount = this.localFallback(ip, limit, windowSec * 1000);
    }

    if (currentCount > limit) {
      throw new HttpException(
        {
          error: {
            code: 'too_many_requests',
            message: 'Too many requests, please try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private localFallback(ip: string, limit: number, windowMs: number): number {
    const now = Date.now();
    let client = this.localIpCache.get(ip);
    if (!client || now > client.resetTime) {
      client = { count: 0, resetTime: now + windowMs };
    }
    client.count++;
    this.localIpCache.set(ip, client);
    return client.count;
  }
}
