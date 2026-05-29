import { CreateProductionOrderHandler } from './create-production-order.handler';
import { ReleaseProductionOrderHandler } from './release-production-order.handler';
import { StartProductionOrderHandler } from './start-production-order.handler';
import { CompleteProductionOrderHandler } from './complete-production-order.handler';
import { CancelProductionOrderHandler } from './cancel-production-order.handler';
import { CompleteOperationHandler } from './complete-operation.handler';

export { CreateProductionOrderCommand } from './create-production-order.handler';
export { ReleaseProductionOrderCommand } from './release-production-order.handler';
export { StartProductionOrderCommand } from './start-production-order.handler';
export { CompleteProductionOrderCommand } from './complete-production-order.handler';
export { CancelProductionOrderCommand } from './cancel-production-order.handler';
export { CompleteOperationCommand } from './complete-operation.handler';

export const ProductionOrderCommandHandlers = [
  CreateProductionOrderHandler,
  ReleaseProductionOrderHandler,
  StartProductionOrderHandler,
  CompleteProductionOrderHandler,
  CancelProductionOrderHandler,
  CompleteOperationHandler,
];
