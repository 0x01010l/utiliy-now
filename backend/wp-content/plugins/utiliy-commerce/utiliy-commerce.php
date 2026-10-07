<?php
/**
 * Plugin Name: Utiliy Commerce
 * Description: Headless catalog, Stripe checkout, and order status API for utiliy.com.
 * Version: 1.1.1
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 */

defined('ABSPATH') || exit;

final class Utiliy_Commerce {
    private const NS = 'utiliy/v1';
    private const OPTION = 'utiliy_commerce_settings';
    private const ORIGINS = [
        'https://utiliy.com',
        'https://www.utiliy.com',
        'http://127.0.0.1:8765',
        'http://localhost:8765',
    ];

    public static function boot(): void {
        add_action('before_woocommerce_init', static function (): void {
            if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
                \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
                    'custom_order_tables',
                    __FILE__,
                    true
                );
            }
        });
        add_action('rest_api_init', [self::class, 'routes']);
        add_filter('rest_pre_serve_request', [self::class, 'cors'], 10, 4);
        add_action('add_meta_boxes', [self::class, 'order_meta_boxes']);
        add_action('admin_post_utiliy_mark_supplier_ordered', [self::class, 'mark_supplier_ordered']);
        add_action('template_redirect', [self::class, 'load_checkout_cart']);
        add_action('woocommerce_check_cart_items', [self::class, 'validate_cart_margins']);
        add_action('woocommerce_checkout_create_order_line_item', [self::class, 'copy_supplier_to_order'], 10, 4);
        add_filter('woocommerce_get_return_url', [self::class, 'return_url'], 10, 2);
        add_filter('home_url', [self::class, 'checkout_home_url'], 10, 4);
        add_action('wp_body_open', [self::class, 'checkout_banner'], 5);
        add_action('wp_head', [self::class, 'checkout_styles']);
        add_filter('wp_robots', static function (array $robots): array {
            $robots['noindex'] = true;
            $robots['nofollow'] = true;
            return $robots;
        });
        if (defined('WP_CLI') && WP_CLI) {
            \WP_CLI::add_command('utiliy sync-catalog', [self::class, 'cli_sync_catalog']);
        }
    }

    public static function routes(): void {
        register_rest_route(self::NS, '/catalog', [
            'methods' => 'GET',
            'callback' => [self::class, 'catalog'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route(self::NS, '/checkout-session', [
            'methods' => 'POST',
            'callback' => [self::class, 'create_checkout_session'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route(self::NS, '/orders/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [self::class, 'order_status'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function cors($served, $result, $request, $server) {
        if (strpos($request->get_route(), '/' . self::NS . '/') !== 0) {
            return $served;
        }

        $origin = get_http_origin();
        if ($origin && in_array($origin, self::ORIGINS, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin', false);
        }
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
        return $served;
    }

    public static function catalog(): WP_REST_Response {
        self::require_woocommerce();
        $products = wc_get_products([
            'status' => 'publish',
            'limit' => -1,
            'return' => 'objects',
        ]);
        $items = [];

        foreach ($products as $product) {
            if ($product->is_type('variable')) {
                foreach ($product->get_children() as $variation_id) {
                    $variation = wc_get_product($variation_id);
                    if ($variation && $variation->get_sku()) {
                        $items[] = self::public_product($variation);
                    }
                }
            } elseif ($product->get_sku()) {
                $items[] = self::public_product($product);
            }
        }

        return new WP_REST_Response([
            'currency' => get_woocommerce_currency(),
            'items' => $items,
        ], 200);
    }

    private static function public_product(WC_Product $product): array {
        $price = (int) round((float) $product->get_price() * 100);
        $minimum = (int) $product->get_meta('_utiliy_minimum_price');
        return [
            'sku' => $product->get_sku(),
            'price' => $price,
            'available' => $minimum > 0 && $price >= $minimum && $product->is_in_stock() && $product->is_purchasable(),
            'stockQuantity' => $product->managing_stock() ? $product->get_stock_quantity() : null,
        ];
    }

    public static function create_checkout_session(WP_REST_Request $request) {
        self::require_woocommerce();
        $rate_error = self::rate_limit();
        if ($rate_error) {
            return $rate_error;
        }
        $payload = $request->get_json_params();
        $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : [];
        if (!$items || count($items) > 20) {
            return new WP_Error('invalid_cart', 'The cart is empty or too large.', ['status' => 400]);
        }

        $cart = [];
        foreach ($items as $item) {
            $sku = sanitize_text_field($item['sku'] ?? '');
            $quantity = max(1, min(10, (int) ($item['qty'] ?? 1)));
            $product_id = $sku ? wc_get_product_id_by_sku($sku) : 0;
            $product = $product_id ? wc_get_product($product_id) : false;
            if (!$product || !$product->is_purchasable() || !$product->is_in_stock() || !$product->has_enough_stock($quantity)) {
                return new WP_Error('unavailable', 'One of those products is unavailable.', ['status' => 400]);
            }
            $minimum = (int) $product->get_meta('_utiliy_minimum_price');
            $selling = (int) round((float) $product->get_price() * 100);
            if (!$minimum || $selling < $minimum) {
                return new WP_Error('margin_guard', 'A product is paused for a supplier cost review.', ['status' => 409]);
            }
            $cart[] = ['product_id' => $product_id, 'quantity' => $quantity];
        }

        $token = bin2hex(random_bytes(24));
        set_transient('utiliy_cart_' . $token, $cart, 15 * MINUTE_IN_SECONDS);
        return new WP_REST_Response([
            'url' => add_query_arg('utiliy_cart_token', $token, home_url('/')),
        ], 201);
    }

    public static function load_checkout_cart(): void {
        if (empty($_GET['utiliy_cart_token'])) {
            return;
        }
        $token = sanitize_text_field(wp_unslash($_GET['utiliy_cart_token']));
        if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
            wp_die('This checkout link is invalid.', 'Checkout unavailable', ['response' => 400]);
        }
        $cart = get_transient('utiliy_cart_' . $token);
        delete_transient('utiliy_cart_' . $token);
        if (!$cart || !is_array($cart)) {
            wp_die('This checkout link expired. Return to utiliy.com and try again.', 'Checkout expired', ['response' => 410]);
        }

        if (function_exists('wc_load_cart') && !WC()->cart) {
            wc_load_cart();
        }
        WC()->cart->empty_cart();
        foreach ($cart as $line) {
            $product = wc_get_product((int) $line['product_id']);
            if (!$product) {
                continue;
            }
            if ($product->is_type('variation')) {
                WC()->cart->add_to_cart(
                    $product->get_parent_id(),
                    (int) $line['quantity'],
                    $product->get_id(),
                    $product->get_variation_attributes()
                );
            } else {
                WC()->cart->add_to_cart($product->get_id(), (int) $line['quantity']);
            }
        }
        wp_safe_redirect(wc_get_checkout_url());
        exit;
    }

    public static function validate_cart_margins(): void {
        if (!WC()->cart) {
            return;
        }
        foreach (WC()->cart->get_cart() as $line) {
            $product = $line['data'] ?? false;
            if (!$product instanceof WC_Product) {
                continue;
            }
            $minimum = (int) $product->get_meta('_utiliy_minimum_price');
            $selling = (int) round((float) $product->get_price() * 100);
            if (!$minimum || $selling < $minimum) {
                wc_add_notice('An item is temporarily unavailable while its supplier cost is reviewed.', 'error');
                return;
            }
        }
    }

    public static function copy_supplier_to_order(WC_Order_Item_Product $item, string $cart_item_key, array $values, WC_Order $order): void {
        $product = $values['data'] ?? false;
        if (!$product instanceof WC_Product) {
            return;
        }
        foreach (self::supplier_data($product) as $key => $value) {
            if ($value !== '') {
                $item->add_meta_data('_utiliy_' . $key, $value, true);
            }
        }
    }

    public static function return_url(string $url, $order): string {
        if (!$order instanceof WC_Order) {
            return $url;
        }
        return add_query_arg([
            'order_id' => $order->get_id(),
            'key' => $order->get_order_key(),
        ], 'https://utiliy.com/order/thanks/');
    }

    public static function checkout_home_url(string $url, string $path, ?string $scheme, ?int $blog_id): string {
        if (!is_admin() && function_exists('is_checkout') && is_checkout() && ($path === '' || $path === '/')) {
            return 'https://utiliy.com/';
        }
        return $url;
    }

    public static function checkout_banner(): void {
        if (function_exists('is_checkout') && is_checkout()) {
            echo '<div class="utiliy-checkout-banner">Shipping to the United States is included. Secure checkout.</div>';
        }
    }

    public static function checkout_styles(): void {
        if (!function_exists('is_checkout') || !is_checkout()) {
            return;
        }
        echo '<style>
            :root{--utiliy-ink:#000;--utiliy-muted:rgba(0,0,0,.6);--utiliy-line:rgba(0,0,0,.1);--utiliy-panel:#f5f5f7}
            body.woocommerce-checkout{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;background:#fff;color:var(--utiliy-ink)}
            .utiliy-checkout-banner{background:#000;color:#fff;text-align:center;font-size:12px;line-height:1.4;padding:8px 16px}
            body.woocommerce-checkout .site-search,
            body.woocommerce-checkout .storefront-primary-navigation,
            body.woocommerce-checkout .woocommerce-breadcrumb,
            body.woocommerce-checkout .site-footer{display:none!important}
            body.woocommerce-checkout .site-header{position:sticky;top:0;z-index:20;background:#fff;margin:0;padding:0;border:0;border-bottom:1px solid var(--utiliy-line)}
            body.admin-bar.woocommerce-checkout .site-header{top:32px}
            body.woocommerce-checkout .site-header .col-full{display:flex;align-items:center;min-height:64px}
            body.woocommerce-checkout .site-branding{width:auto!important;margin:0!important}
            body.woocommerce-checkout .site-title{margin:0;font-size:18px;font-weight:600;letter-spacing:-.02em;line-height:1}
            body.woocommerce-checkout .site-title a{color:#000;text-decoration:none}
            body.woocommerce-checkout .content-area{width:100%;float:none;margin:0}
            body.woocommerce-checkout .site-main{margin:0}
            body.woocommerce-checkout .entry-header{text-align:left;padding:52px 0 24px}
            body.woocommerce-checkout .entry-title{margin:0;font-size:36px;font-weight:600;letter-spacing:-.045em;line-height:1.08}
            body.woocommerce-checkout .col-full{max-width:1180px;padding-inline:24px}
            body.woocommerce-checkout .entry-content{font-size:15px}
            body.woocommerce-checkout .wc-block-components-sidebar-layout{
                display:grid!important;
                grid-template-columns:minmax(0,1.65fr) minmax(340px,.9fr);
                align-items:stretch!important;
                max-width:1180px;
                margin-inline:auto;
                gap:48px
            }
            body.woocommerce-checkout .wc-block-checkout__main{
                grid-column:1;
                width:auto!important;
                max-width:none!important;
                padding-right:0!important
            }
            body.woocommerce-checkout .wc-block-checkout__sidebar{
                grid-column:2;
                grid-row:1;
                align-self:stretch!important;
                width:auto!important;
                max-width:none!important;
                height:100%;
                margin:0!important;
                padding:24px;
                background:var(--utiliy-panel);
                border-radius:6px;
                box-sizing:border-box
            }
            body.woocommerce-checkout .wc-block-components-order-summary{border:0}
            body.woocommerce-checkout .wc-block-components-order-summary-item__image>img{background:#fff;border-radius:4px;object-fit:contain;filter:none}
            body.woocommerce-checkout .wc-block-components-title,
            body.woocommerce-checkout .wc-block-components-checkout-step__heading{font-family:inherit;letter-spacing:-.025em}
            body.woocommerce-checkout .wc-block-components-checkout-step{margin-bottom:32px}
            body.woocommerce-checkout .wc-block-components-checkout-step__container{padding-left:0}
            body.woocommerce-checkout .wc-block-components-checkout-step__description,
            body.woocommerce-checkout .wc-block-components-formatted-money-amount{color:var(--utiliy-muted)}
            body.woocommerce-checkout button,
            body.woocommerce-checkout .button,
            body.woocommerce-checkout .wc-block-components-button{border-radius:4px!important;font-family:inherit;font-weight:500;text-transform:none}
            body.woocommerce-checkout .wc-block-components-button:not(.is-link){min-height:46px;background:#000!important;color:#fff!important;border:1px solid #000!important;box-shadow:none!important}
            body.woocommerce-checkout .wc-block-components-button:not(.is-link):hover{background:#262626!important}
            body.woocommerce-checkout input,
            body.woocommerce-checkout select,
            body.woocommerce-checkout textarea,
            body.woocommerce-checkout .wc-block-components-text-input input{border-radius:4px!important;border-color:rgba(0,0,0,.24)!important;box-shadow:none!important}
            body.woocommerce-checkout a{color:#000;text-underline-offset:3px}
            @media(max-width:782px){body.admin-bar.woocommerce-checkout .site-header{top:46px}}
            @media(max-width:800px){
                body.woocommerce-checkout .wc-block-components-sidebar-layout{grid-template-columns:1fr;gap:28px}
                body.woocommerce-checkout .wc-block-checkout__main,
                body.woocommerce-checkout .wc-block-checkout__sidebar{grid-column:1}
                body.woocommerce-checkout .wc-block-checkout__sidebar{grid-row:auto;height:auto}
                body.woocommerce-checkout .col-full{padding-inline:16px}
                body.woocommerce-checkout .entry-header{padding:36px 0 18px}
                body.woocommerce-checkout .entry-title{font-size:30px}
                body.woocommerce-checkout .wc-block-checkout__sidebar{padding:18px}
            }
        </style>';
    }

    public static function checkout(WP_REST_Request $request) {
        self::require_woocommerce();
        $rate_error = self::rate_limit();
        if ($rate_error) {
            return $rate_error;
        }

        $settings = self::settings();
        if (empty($settings['stripe_secret_key']) || empty($settings['stripe_publishable_key'])) {
            return new WP_Error('not_configured', 'Checkout is not configured.', ['status' => 503]);
        }

        $payload = $request->get_json_params();
        $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : [];
        $customer = isset($payload['customer']) && is_array($payload['customer']) ? $payload['customer'] : [];
        $validation = self::validate_customer($customer);
        if (is_wp_error($validation)) {
            return $validation;
        }
        if (!$items || count($items) > 20) {
            return new WP_Error('invalid_cart', 'The cart is empty or too large.', ['status' => 400]);
        }

        $merged = [];
        foreach ($items as $item) {
            $sku = sanitize_text_field($item['sku'] ?? '');
            $quantity = max(1, min(10, (int) ($item['qty'] ?? 1)));
            if (!$sku) {
                return new WP_Error('invalid_item', 'A cart item is invalid.', ['status' => 400]);
            }
            $merged[$sku] = min(10, ($merged[$sku] ?? 0) + $quantity);
        }

        try {
            $order = wc_create_order(['status' => 'pending', 'created_via' => 'utiliy-headless']);
            foreach ($merged as $sku => $quantity) {
                $product_id = wc_get_product_id_by_sku($sku);
                $product = $product_id ? wc_get_product($product_id) : false;
                if (!$product || !$product->is_purchasable() || !$product->is_in_stock()) {
                    throw new Exception('One of those products is unavailable: ' . $sku);
                }
                if (!$product->has_enough_stock($quantity)) {
                    throw new Exception('The requested quantity is unavailable: ' . $sku);
                }
                $minimum = (int) $product->get_meta('_utiliy_minimum_price');
                $selling = (int) round((float) $product->get_price() * 100);
                if (!$minimum || $selling < $minimum) {
                    throw new Exception('A product is paused for a supplier cost review: ' . $sku);
                }
                $item_id = $order->add_product($product, $quantity);
                $line = $order->get_item($item_id);
                foreach (self::supplier_data($product) as $key => $value) {
                    if ($value !== '') {
                        $line->add_meta_data('_utiliy_' . $key, $value, true);
                    }
                }
                $line->save();
            }

            $address = self::address($customer);
            $order->set_address($address, 'billing');
            $order->set_address($address, 'shipping');
            $shipping = new WC_Order_Item_Shipping();
            $shipping->set_method_title('Shipping included');
            $shipping->set_method_id('utiliy_included');
            $shipping->set_total(0);
            $order->add_item($shipping);
            $order->set_currency('USD');
            $order->set_payment_method('stripe');
            $order->set_payment_method_title('Stripe');
            $order->calculate_totals();
            $order->save();

            $intent = self::create_payment_intent($order, $settings);
            if (is_wp_error($intent)) {
                $order->update_status('failed', 'Stripe could not create a payment.');
                return $intent;
            }

            $order->update_meta_data('_utiliy_stripe_payment_intent', $intent['id']);
            $order->save();
            return new WP_REST_Response([
                'orderId' => $order->get_id(),
                'orderKey' => $order->get_order_key(),
                'clientSecret' => $intent['client_secret'],
                'publishableKey' => $settings['stripe_publishable_key'],
                'amount' => (int) round((float) $order->get_total() * 100),
                'currency' => strtolower($order->get_currency()),
            ], 201);
        } catch (Throwable $error) {
            if (isset($order) && $order instanceof WC_Order) {
                $order->update_status('failed', $error->getMessage());
            }
            return new WP_Error('checkout_failed', $error->getMessage(), ['status' => 400]);
        }
    }

    private static function create_payment_intent(WC_Order $order, array $settings) {
        $address = $order->get_address('shipping');
        $body = [
            'amount' => (int) round((float) $order->get_total() * 100),
            'currency' => strtolower($order->get_currency()),
            'automatic_payment_methods[enabled]' => 'true',
            'receipt_email' => $order->get_billing_email(),
            'description' => 'Utiliy order ' . $order->get_order_number(),
            'metadata[woo_order_id]' => $order->get_id(),
            'metadata[woo_order_key]' => $order->get_order_key(),
            'shipping[name]' => trim($address['first_name'] . ' ' . $address['last_name']),
            'shipping[phone]' => $order->get_billing_phone(),
            'shipping[address][line1]' => $address['address_1'],
            'shipping[address][line2]' => $address['address_2'],
            'shipping[address][city]' => $address['city'],
            'shipping[address][state]' => $address['state'],
            'shipping[address][postal_code]' => $address['postcode'],
            'shipping[address][country]' => 'US',
        ];

        $response = wp_remote_post('https://api.stripe.com/v1/payment_intents', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $settings['stripe_secret_key'],
                'Idempotency-Key' => 'utiliy-order-' . $order->get_id(),
            ],
            'body' => $body,
        ]);
        if (is_wp_error($response)) {
            return new WP_Error('stripe_unavailable', 'Stripe is temporarily unavailable.', ['status' => 502]);
        }

        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (wp_remote_retrieve_response_code($response) >= 300 || empty($data['id']) || empty($data['client_secret'])) {
            $message = $data['error']['message'] ?? 'Stripe could not start the payment.';
            return new WP_Error('stripe_error', $message, ['status' => 502]);
        }
        return $data;
    }

    public static function stripe_webhook(WP_REST_Request $request) {
        self::require_woocommerce();
        $settings = self::settings();
        $secret = $settings['stripe_webhook_secret'] ?? '';
        $payload = $request->get_body();
        $signature = $request->get_header('stripe-signature');
        if (!$secret || !self::valid_stripe_signature($payload, $signature, $secret)) {
            return new WP_Error('invalid_signature', 'Invalid Stripe signature.', ['status' => 400]);
        }

        $event = json_decode($payload, true);
        if (empty($event['id']) || empty($event['type']) || empty($event['data']['object'])) {
            return new WP_Error('invalid_event', 'Invalid Stripe event.', ['status' => 400]);
        }
        if (get_transient('utiliy_stripe_' . md5($event['id']))) {
            return new WP_REST_Response(['received' => true, 'duplicate' => true], 200);
        }

        $object = $event['data']['object'];
        $intent_id = str_starts_with($event['type'], 'payment_intent.')
            ? ($object['id'] ?? '')
            : ($object['payment_intent'] ?? '');
        $order = $intent_id ? self::order_by_intent($intent_id) : false;
        if ($order) {
            $event_meta = '_utiliy_stripe_event_' . md5($event['id']);
            if (!$order->get_meta($event_meta)) {
                self::apply_stripe_event($order, $event['type'], $object);
                $order->update_meta_data($event_meta, gmdate('c'));
                $order->save();
            }
        }

        set_transient('utiliy_stripe_' . md5($event['id']), 1, WEEK_IN_SECONDS);
        return new WP_REST_Response(['received' => true], 200);
    }

    private static function apply_stripe_event(WC_Order $order, string $type, array $object): void {
        if ($type === 'payment_intent.succeeded') {
            $expected = (int) round((float) $order->get_total() * 100);
            if ((int) ($object['amount_received'] ?? 0) !== $expected) {
                $order->add_order_note('Stripe payment amount did not match the WooCommerce order.');
                return;
            }
            if (!$order->is_paid()) {
                $order->payment_complete($object['id']);
                $order->add_order_note('Paid through Utiliy headless Stripe checkout.');
            }
        } elseif ($type === 'payment_intent.payment_failed' && $order->has_status('pending')) {
            $message = $object['last_payment_error']['message'] ?? 'Stripe payment failed.';
            $order->update_status('failed', $message);
        } elseif ($type === 'charge.refunded') {
            $refunded = ((int) ($object['amount_refunded'] ?? 0)) / 100;
            $already = (float) $order->get_total_refunded();
            $difference = round($refunded - $already, 2);
            if ($difference > 0) {
                wc_create_refund([
                    'order_id' => $order->get_id(),
                    'amount' => $difference,
                    'reason' => 'Stripe refund',
                    'refund_payment' => false,
                    'restock_items' => false,
                ]);
            }
        }
    }

    public static function order_status(WP_REST_Request $request) {
        self::require_woocommerce();
        $order = wc_get_order((int) $request['id']);
        $key = sanitize_text_field($request->get_param('key') ?? '');
        if (!$order || !$key || !hash_equals($order->get_order_key(), $key)) {
            return new WP_Error('not_found', 'Order not found.', ['status' => 404]);
        }
        return new WP_REST_Response([
            'orderId' => $order->get_id(),
            'status' => $order->get_status(),
            'paid' => $order->is_paid(),
            'total' => (int) round((float) $order->get_total() * 100),
            'currency' => $order->get_currency(),
        ], 200);
    }

    public static function import_stripe_session(WP_REST_Request $request) {
        self::require_woocommerce();
        $settings = self::settings();
        $provided = (string) $request->get_header('x-utiliy-bridge');
        if (empty($settings['bridge_secret']) || !$provided || !hash_equals($settings['bridge_secret'], $provided)) {
            return new WP_Error('forbidden', 'Forbidden.', ['status' => 403]);
        }

        $payload = $request->get_json_params();
        $session_id = sanitize_text_field($payload['sessionId'] ?? '');
        $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : [];
        $customer = isset($payload['customer']) && is_array($payload['customer']) ? $payload['customer'] : [];
        $amount_total = (int) ($payload['amountTotal'] ?? 0);
        if (!str_starts_with($session_id, 'cs_') || !$items || $amount_total <= 0) {
            return new WP_Error('invalid_session', 'Invalid checkout session.', ['status' => 400]);
        }

        $existing = wc_get_orders([
            'limit' => 1,
            'meta_key' => '_utiliy_stripe_checkout_session',
            'meta_value' => $session_id,
            'return' => 'objects',
        ]);
        if ($existing) {
            return self::imported_order_response($existing[0]);
        }

        $validation = self::validate_customer($customer);
        if (is_wp_error($validation)) {
            return $validation;
        }

        try {
            $order = wc_create_order(['status' => 'pending', 'created_via' => 'utiliy-stripe-checkout']);
            foreach ($items as $item) {
                $sku = sanitize_text_field($item['sku'] ?? '');
                $quantity = max(1, min(10, (int) ($item['qty'] ?? 1)));
                $product_id = wc_get_product_id_by_sku($sku);
                $product = $product_id ? wc_get_product($product_id) : false;
                if (!$product || !$product->is_purchasable()) {
                    throw new Exception('Unknown or unavailable SKU: ' . $sku);
                }
                $minimum = (int) $product->get_meta('_utiliy_minimum_price');
                $selling = (int) round((float) $product->get_price() * 100);
                if (!$minimum || $selling < $minimum) {
                    throw new Exception('Supplier cost review required for: ' . $sku);
                }
                $item_id = $order->add_product($product, $quantity);
                $line = $order->get_item($item_id);
                foreach (self::supplier_data($product) as $key => $value) {
                    if ($value !== '') {
                        $line->add_meta_data('_utiliy_' . $key, $value, true);
                    }
                }
                $line->save();
            }

            $address = self::address($customer);
            $order->set_address($address, 'billing');
            $order->set_address($address, 'shipping');
            $shipping = new WC_Order_Item_Shipping();
            $shipping->set_method_title('Shipping included');
            $shipping->set_method_id('utiliy_included');
            $shipping->set_total(0);
            $order->add_item($shipping);
            $order->set_currency('USD');
            $order->set_payment_method('stripe_checkout');
            $order->set_payment_method_title('Stripe Checkout');
            $order->update_meta_data('_utiliy_stripe_checkout_session', $session_id);
            $order->calculate_totals();

            $calculated = (int) round((float) $order->get_total() * 100);
            if ($calculated !== $amount_total) {
                throw new Exception('Stripe and WooCommerce totals do not match.');
            }
            $order->save();
            $order->payment_complete($session_id);
            $order->add_order_note('Imported from a verified paid Stripe Checkout Session.');
            $order->save();
            return self::imported_order_response($order);
        } catch (Throwable $error) {
            if (isset($order) && $order instanceof WC_Order) {
                $order->update_status('failed', $error->getMessage());
            }
            return new WP_Error('order_import_failed', $error->getMessage(), ['status' => 400]);
        }
    }

    private static function imported_order_response(WC_Order $order): WP_REST_Response {
        return new WP_REST_Response([
            'orderId' => $order->get_id(),
            'orderKey' => $order->get_order_key(),
            'status' => $order->get_status(),
        ], 200);
    }

    private static function validate_customer(array $customer) {
        $required = ['firstName', 'lastName', 'email', 'phone', 'address1', 'city', 'state', 'postcode'];
        foreach ($required as $field) {
            if (empty(trim((string) ($customer[$field] ?? '')))) {
                return new WP_Error('missing_address', 'Complete every required address field.', ['status' => 400]);
            }
        }
        if (!is_email($customer['email'])) {
            return new WP_Error('invalid_email', 'Enter a valid email address.', ['status' => 400]);
        }
        if (strtoupper((string) ($customer['country'] ?? 'US')) !== 'US') {
            return new WP_Error('unsupported_country', 'Utiliy currently ships only to the United States.', ['status' => 400]);
        }
        return true;
    }

    private static function address(array $customer): array {
        return [
            'first_name' => sanitize_text_field($customer['firstName']),
            'last_name' => sanitize_text_field($customer['lastName']),
            'company' => sanitize_text_field($customer['company'] ?? ''),
            'email' => sanitize_email($customer['email']),
            'phone' => sanitize_text_field($customer['phone']),
            'address_1' => sanitize_text_field($customer['address1']),
            'address_2' => sanitize_text_field($customer['address2'] ?? ''),
            'city' => sanitize_text_field($customer['city']),
            'state' => strtoupper(sanitize_text_field($customer['state'])),
            'postcode' => sanitize_text_field($customer['postcode']),
            'country' => 'US',
        ];
    }

    private static function valid_stripe_signature(string $payload, string $header, string $secret): bool {
        $timestamp = 0;
        $signatures = [];
        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($key === 't') {
                $timestamp = (int) $value;
            } elseif ($key === 'v1') {
                $signatures[] = $value;
            }
        }
        if (!$timestamp || abs(time() - $timestamp) > 300 || !$signatures) {
            return false;
        }
        $expected = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }
        return false;
    }

    private static function order_by_intent(string $intent_id) {
        $orders = wc_get_orders([
            'limit' => 1,
            'meta_key' => '_utiliy_stripe_payment_intent',
            'meta_value' => sanitize_text_field($intent_id),
            'return' => 'objects',
        ]);
        return $orders ? $orders[0] : false;
    }

    private static function rate_limit() {
        $ip = sanitize_text_field($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $key = 'utiliy_checkout_' . md5($ip);
        $count = (int) get_transient($key);
        if ($count >= 20) {
            return new WP_Error('rate_limited', 'Too many checkout attempts. Try again later.', ['status' => 429]);
        }
        set_transient($key, $count + 1, 10 * MINUTE_IN_SECONDS);
        return null;
    }

    private static function supplier_data(WC_Product $product): array {
        $parent = $product->is_type('variation') ? wc_get_product($product->get_parent_id()) : false;
        $read = static function (string $key) use ($product, $parent): string {
            $value = (string) $product->get_meta('_utiliy_' . $key);
            return $value !== '' || !$parent ? $value : (string) $parent->get_meta('_utiliy_' . $key);
        };
        return [
            'supplier' => $read('supplier'),
            'supplier_url' => $read('supplier_url'),
            'supplier_option' => $read('supplier_option'),
            'supplier_variation_id' => $read('supplier_variation_id'),
            'supplier_product_id' => $read('supplier_product_id'),
            'supplier_cost' => $read('supplier_cost'),
            'shipping_cost' => $read('shipping_cost'),
            'cost_checked_at' => $read('cost_checked_at'),
            'minimum_price' => $read('minimum_price'),
        ];
    }

    public static function order_meta_boxes(): void {
        add_meta_box(
            'utiliy-fulfillment',
            'Utiliy manual fulfillment',
            [self::class, 'render_fulfillment_box'],
            'shop_order',
            'normal',
            'high'
        );
        add_meta_box(
            'utiliy-fulfillment',
            'Utiliy manual fulfillment',
            [self::class, 'render_fulfillment_box'],
            'woocommerce_page_wc-orders',
            'normal',
            'high'
        );
    }

    public static function render_fulfillment_box($post_or_order): void {
        $order = $post_or_order instanceof WC_Order
            ? $post_or_order
            : wc_get_order($post_or_order->ID ?? 0);
        if (!$order) {
            return;
        }

        $status = $order->get_meta('_utiliy_fulfillment_status') ?: 'Not ordered';
        echo '<p><strong>Status:</strong> ' . esc_html($status) . '</p>';
        echo '<table class="widefat striped"><thead><tr><th>Item</th><th>Supplier</th><th>Exact option</th><th>Action</th></tr></thead><tbody>';
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $url = (string) $item->get_meta('_utiliy_supplier_url');
            $supplier = (string) $item->get_meta('_utiliy_supplier');
            $option = (string) $item->get_meta('_utiliy_supplier_option');
            $variation = (string) $item->get_meta('_utiliy_supplier_variation_id');
            $cost = (int) $item->get_meta('_utiliy_supplier_cost');
            $shipping = (int) $item->get_meta('_utiliy_shipping_cost');
            $minimum = (int) $item->get_meta('_utiliy_minimum_price');
            echo '<tr>';
            echo '<td>' . esc_html($item->get_name()) . ' × ' . esc_html((string) $item->get_quantity()) . '<br><code>' . esc_html($product ? $product->get_sku() : '') . '</code></td>';
            echo '<td>' . esc_html($supplier ?: 'Supplier not recorded') . ($cost ? '<br>Cost + shipping: $' . esc_html(number_format(($cost + $shipping) / 100, 2)) . '<br>30% floor: $' . esc_html(number_format($minimum / 100, 2)) : '') . '</td>';
            echo '<td>' . esc_html($option ?: 'Default') . ($variation ? '<br><code>' . esc_html($variation) . '</code>' : '') . '</td>';
            echo '<td>' . ($url ? '<a class="button" target="_blank" rel="noopener" href="' . esc_url($url) . '">Open supplier</a>' : 'No link') . '</td>';
            echo '</tr>';
        }
        echo '</tbody></table>';

        if ($status !== 'Ordered from supplier') {
            $url = wp_nonce_url(
                admin_url('admin-post.php?action=utiliy_mark_supplier_ordered&order_id=' . $order->get_id()),
                'utiliy_mark_supplier_ordered_' . $order->get_id()
            );
            echo '<p><a class="button button-primary" href="' . esc_url($url) . '">Mark supplier orders placed</a></p>';
        }
    }

    public static function mark_supplier_ordered(): void {
        $order_id = absint($_GET['order_id'] ?? 0);
        check_admin_referer('utiliy_mark_supplier_ordered_' . $order_id);
        if (!current_user_can('manage_woocommerce')) {
            wp_die('You cannot edit this order.');
        }
        $order = wc_get_order($order_id);
        if ($order) {
            $order->update_meta_data('_utiliy_fulfillment_status', 'Ordered from supplier');
            $order->add_order_note('Supplier order placed manually.');
            $order->save();
        }
        wp_safe_redirect(wp_get_referer() ?: admin_url('admin.php?page=wc-orders&action=edit&id=' . $order_id));
        exit;
    }

    public static function cli_sync_catalog(array $args): void {
        self::require_woocommerce();
        $file = $args[0] ?? '';
        if (!$file || !is_readable($file)) {
            \WP_CLI::error('Provide a readable catalog/products.json path.');
        }
        $catalog = json_decode((string) file_get_contents($file), true);
        if (empty($catalog['products']) || !is_array($catalog['products'])) {
            \WP_CLI::error('The catalog has no products.');
        }

        $count = 0;
        foreach ($catalog['products'] as $record) {
            self::sync_product($record);
            $count++;
        }
        \WP_CLI::success('Synchronized ' . $count . ' catalog products.');
    }

    private static function sync_product(array $record): void {
        $category_id = self::category_id((string) ($record['category'] ?? 'Home'));
        $variants = !empty($record['variants']) && is_array($record['variants']) ? $record['variants'] : [];

        if (!$variants) {
            $sku = (string) $record['sku'];
            $existing_id = wc_get_product_id_by_sku($sku);
            $product = $existing_id ? wc_get_product($existing_id) : new WC_Product_Simple();
            if (!$product instanceof WC_Product_Simple) {
                \WP_CLI::error('SKU has the wrong product type: ' . $sku);
            }
            self::set_common_product_fields($product, $record, $category_id);
            $product->set_sku($sku);
            $product->set_regular_price(wc_format_decimal(((int) $record['price']) / 100, 2));
            $product->set_price(wc_format_decimal(((int) $record['price']) / 100, 2));
            self::set_supplier_meta($product, $record['autods'] ?? []);
            self::assert_margin($sku, (int) $record['price'], $product);
            $product->save();
            self::sync_product_image($product, $record);
            return;
        }

        $parent_id = self::product_id_by_slug((string) $record['slug']);
        $parent = $parent_id ? wc_get_product($parent_id) : new WC_Product_Variable();
        if (!$parent instanceof WC_Product_Variable) {
            \WP_CLI::error('Slug has the wrong product type: ' . $record['slug']);
        }
        self::set_common_product_fields($parent, $record, $category_id);
        self::set_supplier_meta($parent, $record['autods'] ?? []);

        $attribute = new WC_Product_Attribute();
        $attribute->set_name('Option');
        $attribute->set_options(array_values(array_map(static fn ($variant) => (string) $variant['label'], $variants)));
        $attribute->set_visible(true);
        $attribute->set_variation(true);
        $parent->set_attributes([$attribute]);
        $parent_id = $parent->save();
        self::sync_product_image($parent, $record);

        foreach ($variants as $variant_record) {
            $sku = (string) $variant_record['sku'];
            $existing_id = wc_get_product_id_by_sku($sku);
            $variation = $existing_id ? wc_get_product($existing_id) : new WC_Product_Variation();
            if (!$variation instanceof WC_Product_Variation) {
                \WP_CLI::error('SKU has the wrong variation type: ' . $sku);
            }
            $variation->set_parent_id($parent_id);
            $variation->set_status('publish');
            $variation->set_sku($sku);
            $variation->set_regular_price(wc_format_decimal(((int) $variant_record['price']) / 100, 2));
            $variation->set_price(wc_format_decimal(((int) $variant_record['price']) / 100, 2));
            $variation->set_stock_status('instock');
            $variation->set_manage_stock(false);
            $variation->set_attributes(['option' => (string) $variant_record['label']]);
            $supplier = array_merge($record['autods'] ?? [], $variant_record['autods'] ?? []);
            self::set_supplier_meta($variation, $supplier);
            self::assert_margin($sku, (int) $variant_record['price'], $variation);
            $variation->save();
        }
        WC_Product_Variable::sync($parent_id);
    }

    private static function sync_product_image(WC_Product $product, array $record): void {
        $url = esc_url_raw((string) ($record['image'] ?? ''));
        if (!$url || !$product->get_id()) {
            return;
        }
        if ($product->get_image_id() && $product->get_meta('_utiliy_image_source') === $url) {
            return;
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $attachment_id = media_sideload_image($url, $product->get_id(), (string) $record['name'], 'id');
        if (is_wp_error($attachment_id)) {
            \WP_CLI::warning('Could not import image for ' . (string) $record['slug'] . ': ' . $attachment_id->get_error_message());
            return;
        }

        update_post_meta((int) $attachment_id, '_wp_attachment_image_alt', sanitize_text_field((string) $record['name']));
        $product->set_image_id((int) $attachment_id);
        $product->update_meta_data('_utiliy_image_source', $url);
        $product->save();
    }

    private static function set_common_product_fields(WC_Product $product, array $record, int $category_id): void {
        $product->set_name((string) $record['name']);
        $product->set_slug((string) $record['slug']);
        $product->set_description(wp_kses_post((string) ($record['summary'] ?? '')));
        $product->set_short_description(wp_kses_post((string) ($record['fit'] ?? '')));
        $product->set_status('publish');
        $product->set_catalog_visibility('visible');
        $product->set_stock_status('instock');
        $product->set_manage_stock(false);
        $product->set_category_ids([$category_id]);
    }

    private static function set_supplier_meta(WC_Product $product, array $supplier): void {
        $site = (string) ($supplier['site'] ?? '');
        $site_id = (string) ($supplier['idOnSite'] ?? '');
        $product_id = (string) ($supplier['productId'] ?? '');
        if ($site === 'aliexpress' && $site_id) {
            $url = 'https://www.aliexpress.com/item/' . rawurlencode($site_id) . '.html';
        } elseif ($product_id) {
            $url = 'https://platform.autods.com/marketplace/all-products/' . rawurlencode($product_id);
        } else {
            $url = '';
        }
        $meta = [
            'supplier' => (string) ($supplier['supplier'] ?? ''),
            'supplier_url' => $url,
            'supplier_option' => (string) ($supplier['supplierOption'] ?? ''),
            'supplier_variation_id' => (string) ($supplier['variationId'] ?? ''),
            'supplier_product_id' => $product_id,
            'supplier_cost' => (int) ($supplier['cost'] ?? 0),
            'shipping_cost' => (int) ($supplier['shippingCost'] ?? 0),
            'cost_checked_at' => (string) ($supplier['costCheckedAt'] ?? ''),
        ];
        $meta['minimum_price'] = self::minimum_price($meta['supplier_cost'], $meta['shipping_cost']);
        foreach ($meta as $key => $value) {
            $product->update_meta_data('_utiliy_' . $key, $value);
        }
    }

    private static function minimum_price(int $cost, int $shipping): int {
        if ($cost <= 0) {
            return 0;
        }
        $stripe_percentage = 0.029;
        $stripe_fixed_cents = 30;
        $target_margin = 0.30;
        return (int) ceil(($cost + $shipping + $stripe_fixed_cents) / (1 - $target_margin - $stripe_percentage));
    }

    private static function assert_margin(string $sku, int $selling_price, WC_Product $product): void {
        $minimum = (int) $product->get_meta('_utiliy_minimum_price');
        if (!$minimum || $selling_price < $minimum) {
            \WP_CLI::error(sprintf(
                '%s price $%.2f is below its guarded minimum $%.2f.',
                $sku,
                $selling_price / 100,
                $minimum / 100
            ));
        }
    }

    private static function category_id(string $name): int {
        $term = term_exists($name, 'product_cat');
        if (!$term) {
            $term = wp_insert_term($name, 'product_cat');
        }
        if (is_wp_error($term)) {
            \WP_CLI::error($term->get_error_message());
        }
        return (int) (is_array($term) ? $term['term_id'] : $term);
    }

    private static function product_id_by_slug(string $slug): int {
        $post = get_page_by_path($slug, OBJECT, 'product');
        return $post ? (int) $post->ID : 0;
    }

    private static function require_woocommerce(): void {
        if (!class_exists('WooCommerce')) {
            throw new RuntimeException('WooCommerce is required.');
        }
    }

    private static function settings(): array {
        return wp_parse_args((array) get_option(self::OPTION, []), [
            'stripe_publishable_key' => '',
            'stripe_secret_key' => '',
            'stripe_webhook_secret' => '',
            'bridge_secret' => '',
        ]);
    }

    public static function admin_menu(): void {
        add_submenu_page(
            'woocommerce',
            'Utiliy Commerce',
            'Utiliy Commerce',
            'manage_woocommerce',
            'utiliy-commerce',
            [self::class, 'settings_page']
        );
    }

    public static function register_settings(): void {
        register_setting('utiliy_commerce', self::OPTION, [
            'type' => 'array',
            'sanitize_callback' => [self::class, 'sanitize_settings'],
        ]);
    }

    public static function sanitize_settings(array $input): array {
        $current = self::settings();
        $output = [
            'stripe_publishable_key' => sanitize_text_field($input['stripe_publishable_key'] ?? ''),
            'stripe_secret_key' => trim((string) ($input['stripe_secret_key'] ?? '')),
            'stripe_webhook_secret' => trim((string) ($input['stripe_webhook_secret'] ?? '')),
            'bridge_secret' => trim((string) ($input['bridge_secret'] ?? '')),
        ];
        foreach (['stripe_secret_key', 'stripe_webhook_secret', 'bridge_secret'] as $secret) {
            if ($output[$secret] === '') {
                $output[$secret] = $current[$secret];
            }
        }
        return $output;
    }

    public static function settings_page(): void {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }
        $settings = self::settings();
        ?>
        <div class="wrap">
            <h1>Utiliy Commerce</h1>
            <p>Stripe webhook URL: <code><?php echo esc_html(rest_url(self::NS . '/stripe/webhook')); ?></code></p>
            <form method="post" action="options.php">
                <?php settings_fields('utiliy_commerce'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th><label for="utiliy-pk">Stripe publishable key</label></th>
                        <td><input class="regular-text" id="utiliy-pk" name="<?php echo esc_attr(self::OPTION); ?>[stripe_publishable_key]" value="<?php echo esc_attr($settings['stripe_publishable_key']); ?>" autocomplete="off"></td>
                    </tr>
                    <tr>
                        <th><label for="utiliy-sk">Stripe secret key</label></th>
                        <td><input class="regular-text" type="password" id="utiliy-sk" name="<?php echo esc_attr(self::OPTION); ?>[stripe_secret_key]" value="" placeholder="Leave blank to keep the saved key" autocomplete="new-password"></td>
                    </tr>
                    <tr>
                        <th><label for="utiliy-wh">Stripe webhook secret</label></th>
                        <td><input class="regular-text" type="password" id="utiliy-wh" name="<?php echo esc_attr(self::OPTION); ?>[stripe_webhook_secret]" value="" placeholder="Leave blank to keep the saved secret" autocomplete="new-password"></td>
                    </tr>
                    <tr>
                        <th><label for="utiliy-bridge">Checkout bridge secret</label></th>
                        <td><input class="regular-text" type="password" id="utiliy-bridge" name="<?php echo esc_attr(self::OPTION); ?>[bridge_secret]" value="" placeholder="Managed during deployment" autocomplete="new-password"></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}

Utiliy_Commerce::boot();
