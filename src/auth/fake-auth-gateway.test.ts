import { authGatewayContract } from './auth-gateway-contract';
import { FakeAuthGateway } from './fake-auth-gateway';

authGatewayContract(async () => {
  const gateway = new FakeAuthGateway();
  return {
    gateway,
    createUser: async (email, password, role) => {
      gateway.registerUser({ email, password, role });
    },
  };
});
