import { MENU, FREE_DELIVERY_OVER, DELIVERY_FEE, TAX_RATE, json } from '../_lib/util.js';

export const onRequestGet = ({ env }) =>
  json({ items: MENU, freeDeliveryOver: FREE_DELIVERY_OVER, deliveryFee: DELIVERY_FEE, taxRate: TAX_RATE, gateway: env.RAZORPAY_KEY_ID ? 'razorpay' : 'test' });
