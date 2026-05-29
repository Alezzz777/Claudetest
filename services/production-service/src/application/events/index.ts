import { ProductionOrderStartedHandler } from './production-order-started.handler';
import { ProductionOrderProjectionHandler } from './production-order-projection.handler';
import { GenealogyProjectionHandler } from './genealogy-projection.handler';

export { ProductionOrderStartedHandler } from './production-order-started.handler';
export { ProductionOrderProjectionHandler } from './production-order-projection.handler';
export { GenealogyProjectionHandler } from './genealogy-projection.handler';

export const ProductionEventHandlers = [
  ProductionOrderStartedHandler,
  ProductionOrderProjectionHandler,
  GenealogyProjectionHandler,
];
