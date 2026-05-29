import { GetProductionOrderHandler } from './get-production-order.handler';
import { ListProductionOrdersHandler } from './list-production-orders.handler';
import { GetOeeHandler } from './get-oee.handler';
import { GetGenealogyHandler } from './get-genealogy.handler';

export { GetProductionOrderQuery } from './get-production-order.handler';
export { ListProductionOrdersQuery } from './list-production-orders.handler';
export { GetOeeQuery } from './get-oee.handler';
export { GetGenealogyQuery } from './get-genealogy.handler';

export const ProductionOrderQueryHandlers = [
  GetProductionOrderHandler,
  ListProductionOrdersHandler,
  GetOeeHandler,
  GetGenealogyHandler,
];
