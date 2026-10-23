import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { appointmentRouter } from './modules/appointments/appointment.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { painRouter } from './modules/pain/pain.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // sau Nginx/Load balancer
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/appointments', appointmentRouter);
  api.use('/patients/:patientId', painRouter);
  // Các module tiếp theo gắn tương tự:
  // api.use('/patients', patientRouter);        // Hành chính, tiền sử, dị ứng
  // api.use('/encounters', encounterRouter);    // Khám, chỉ định CLS, chẩn đoán, kế hoạch điều trị
  // api.use('/prescriptions', prescriptionRouter);
  // api.use('/inventory', inventoryRouter);     // Lô, hạn dùng, cảnh báo tồn thấp, xuất FEFO
  // api.use('/invoices', billingRouter);
  // api.use('/reports', reportRouter);
  // api.use('/schedules', shiftRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
