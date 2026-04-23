export type JwtPayload = {
  sub: string;
  email: string;
  tokenVersion: number;
  tokenType: 'access' | 'refresh';
};
