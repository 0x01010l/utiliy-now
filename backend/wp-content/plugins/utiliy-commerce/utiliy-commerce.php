<?php
/**
 * Plugin Name: Utiliy Commerce
 * Description: Headless WooCommerce cart handoff, catalog sync, fulfillment, and order status for utiliy.com.
 * Version: 1.3.0
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 */

defined('ABSPATH') || exit;

final class Utiliy_Commerce {
    private const NS = 'utiliy/v1';
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
        add_action('admin_post_utiliy_mark_shipped', [self::class, 'mark_shipped']);
        add_action('template_redirect', [self::class, 'load_checkout_cart']);
        add_action('woocommerce_check_cart_items', [self::class, 'validate_cart_margins']);
        add_action('woocommerce_checkout_create_order_line_item', [self::class, 'copy_supplier_to_order'], 10, 4);
        add_filter('woocommerce_get_return_url', [self::class, 'return_url'], 10, 2);
        add_filter('home_url', [self::class, 'checkout_home_url'], 10, 4);
        add_action('wp_body_open', [self::class, 'checkout_banner'], 5);
        add_action('wp_head', [self::class, 'favicon'], 1);
        add_action('login_head', [self::class, 'favicon']);
        add_action('wp_head', [self::class, 'checkout_styles']);
        add_filter('pre_wp_mail', [self::class, 'send_mail_with_azure'], 10, 2);
        add_filter('woocommerce_email_from_name', static fn (): string => 'Utiliy');
        add_filter('woocommerce_email_from_address', static fn (): string => 'hello@utiliy.com');
        add_action('woocommerce_email_order_meta', [self::class, 'email_tracking'], 20, 4);
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
        return [
            'sku' => $product->get_sku(),
            'price' => $price,
            'available' => self::product_guard_error($product) === '' && $product->is_in_stock() && $product->is_purchasable(),
            'stockQuantity' => $product->managing_stock() ? $product->get_stock_quantity() : null,
            'stockCheckedAt' => (string) $product->get_meta('_utiliy_stock_checked_at'),
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

        $merged = [];
        foreach ($items as $item) {
            $sku = sanitize_text_field($item['sku'] ?? '');
            $quantity = max(1, min(10, (int) ($item['qty'] ?? 1)));
            if (!$sku) {
                return new WP_Error('invalid_item', 'A cart item is invalid.', ['status' => 400]);
            }
            $merged[$sku] = ($merged[$sku] ?? 0) + $quantity;
            if ($merged[$sku] > 10) {
                return new WP_Error('quantity_limit', 'A maximum of 10 units per item is allowed.', ['status' => 400]);
            }
        }

        $cart = [];
        foreach ($merged as $sku => $quantity) {
            $product_id = $sku ? wc_get_product_id_by_sku($sku) : 0;
            $product = $product_id ? wc_get_product($product_id) : false;
            if (!$product || !$product->is_purchasable() || !$product->is_in_stock() || !$product->has_enough_stock($quantity)) {
                return new WP_Error('unavailable', $sku . ' is currently unavailable.', ['status' => 409]);
            }
            $guard_error = self::product_guard_error($product);
            if ($guard_error) {
                return new WP_Error('product_paused', $guard_error, ['status' => 409]);
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
        $validated = [];
        foreach ($cart as $line) {
            $product = wc_get_product((int) $line['product_id']);
            $quantity = (int) ($line['quantity'] ?? 0);
            if (
                !$product ||
                $quantity < 1 ||
                $quantity > 10 ||
                !$product->is_purchasable() ||
                !$product->is_in_stock() ||
                !$product->has_enough_stock($quantity) ||
                self::product_guard_error($product)
            ) {
                wp_die(
                    'An item changed or became unavailable. Return to utiliy.com and review your cart.',
                    'Checkout unavailable',
                    ['response' => 409]
                );
            }
            $validated[] = ['product' => $product, 'quantity' => $quantity];
        }

        WC()->cart->empty_cart();
        foreach ($validated as $line) {
            $product = $line['product'];
            if ($product->is_type('variation')) {
                $added = WC()->cart->add_to_cart(
                    $product->get_parent_id(),
                    $line['quantity'],
                    $product->get_id(),
                    $product->get_variation_attributes()
                );
            } else {
                $added = WC()->cart->add_to_cart($product->get_id(), $line['quantity']);
            }
            if (!$added) {
                WC()->cart->empty_cart();
                wp_die(
                    'The cart could not be prepared. Return to utiliy.com and try again.',
                    'Checkout unavailable',
                    ['response' => 409]
                );
            }
        }
        WC()->cart->calculate_totals();
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
            $guard_error = self::product_guard_error($product);
            if ($guard_error) {
                wc_add_notice($guard_error, 'error');
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

    public static function favicon(): void {
        echo '<link rel="icon" href="https://utiliy.com/assets/favicon.svg" type="image/svg+xml">';
    }

    public static function send_mail_with_azure($short_circuit, array $attributes) {
        $endpoint = rtrim((string) getenv('ACS_EMAIL_ENDPOINT'), '/');
        $access_key = (string) getenv('ACS_EMAIL_ACCESS_KEY');
        $sender = sanitize_email((string) getenv('ACS_EMAIL_SENDER'));
        if (!$endpoint || !$access_key || !$sender) {
            return $short_circuit;
        }

        $to = self::email_addresses($attributes['to'] ?? []);
        if (!$to) {
            return false;
        }

        $headers = $attributes['headers'] ?? [];
        if (is_string($headers)) {
            $headers = preg_split('/\r?\n/', $headers) ?: [];
        }
        $is_html = false;
        $cc = [];
        $bcc = [];
        $reply_to = [];
        foreach ((array) $headers as $header) {
            if (!is_string($header) || strpos($header, ':') === false) {
                continue;
            }
            [$name, $value] = array_map('trim', explode(':', $header, 2));
            if (strcasecmp($name, 'Content-Type') === 0 && stripos($value, 'text/html') !== false) {
                $is_html = true;
            } elseif (strcasecmp($name, 'Cc') === 0) {
                $cc = array_merge($cc, self::email_addresses($value));
            } elseif (strcasecmp($name, 'Bcc') === 0) {
                $bcc = array_merge($bcc, self::email_addresses($value));
            } elseif (strcasecmp($name, 'Reply-To') === 0) {
                $reply_to = array_merge($reply_to, self::email_addresses($value));
            }
        }

        $message = (string) ($attributes['message'] ?? '');
        $content = [
            'subject' => wp_strip_all_tags((string) ($attributes['subject'] ?? '')),
            'plainText' => trim(preg_replace('/\s+/', ' ', wp_strip_all_tags($message))),
        ];
        if ($is_html || stripos($message, '<html') !== false || stripos($message, '<body') !== false) {
            $content['html'] = $message;
        }

        $recipients = ['to' => $to];
        if ($cc) {
            $recipients['cc'] = $cc;
        }
        if ($bcc) {
            $recipients['bcc'] = $bcc;
        }
        $payload = [
            'senderAddress' => $sender,
            'recipients' => $recipients,
            'content' => $content,
            'userEngagementTrackingDisabled' => true,
        ];
        if ($reply_to) {
            $payload['replyTo'] = $reply_to;
        }

        $attachments = [];
        foreach ((array) ($attributes['attachments'] ?? []) as $attachment) {
            if (!is_string($attachment) || !is_readable($attachment) || filesize($attachment) > 10 * MB_IN_BYTES) {
                continue;
            }
            $attachments[] = [
                'name' => basename($attachment),
                'contentType' => function_exists('mime_content_type') ? mime_content_type($attachment) : 'application/octet-stream',
                'contentInBase64' => base64_encode((string) file_get_contents($attachment)),
            ];
        }
        if ($attachments) {
            $payload['attachments'] = $attachments;
        }

        $body = wp_json_encode($payload);
        $url = $endpoint . '/emails:send?api-version=2025-09-01';
        $parts = wp_parse_url($url);
        $host = (string) ($parts['host'] ?? '');
        $path_and_query = (string) ($parts['path'] ?? '/') . '?' . (string) ($parts['query'] ?? '');
        $date = gmdate('D, d M Y H:i:s') . ' GMT';
        $content_hash = base64_encode(hash('sha256', $body, true));
        $decoded_key = base64_decode($access_key, true);
        if (!$host || $decoded_key === false) {
            error_log('[Utiliy ACS email] Invalid endpoint or access key.');
            return $short_circuit;
        }
        $string_to_sign = "POST\n{$path_and_query}\n{$date};{$host};{$content_hash}";
        $signature = base64_encode(hash_hmac('sha256', $string_to_sign, $decoded_key, true));
        $authorization = 'HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=' . $signature;

        $response = wp_remote_post($url, [
            'timeout' => 20,
            'headers' => [
                'Authorization' => $authorization,
                'Content-Type' => 'application/json',
                'x-ms-date' => $date,
                'x-ms-content-sha256' => $content_hash,
            ],
            'body' => $body,
        ]);
        if (is_wp_error($response)) {
            update_option('utiliy_acs_email_last_send', [
                'status' => 'failed',
                'sent_at' => time(),
                'error' => $response->get_error_message(),
            ], false);
            error_log('[Utiliy ACS email] ' . $response->get_error_message());
            return $short_circuit;
        }
        $status = wp_remote_retrieve_response_code($response);
        if ($status !== 202) {
            update_option('utiliy_acs_email_last_send', [
                'status' => 'failed',
                'sent_at' => time(),
                'http_status' => $status,
            ], false);
            error_log('[Utiliy ACS email] Azure rejected a message with HTTP ' . $status . '.');
            return $short_circuit;
        }
        update_option('utiliy_acs_email_last_send', [
            'status' => 'accepted',
            'sent_at' => time(),
            'operation' => wp_remote_retrieve_header($response, 'operation-location'),
        ], false);
        return true;
    }

    private static function email_addresses($value): array {
        $values = is_array($value) ? $value : explode(',', (string) $value);
        $addresses = [];
        foreach ($values as $entry) {
            $entry = trim((string) $entry);
            if (!$entry) {
                continue;
            }
            $display_name = '';
            $email = $entry;
            if (preg_match('/^(.*?)<([^>]+)>$/', $entry, $matches)) {
                $display_name = trim($matches[1], " \t\n\r\0\x0B\"");
                $email = trim($matches[2]);
            }
            $email = sanitize_email($email);
            if (!$email) {
                continue;
            }
            $address = ['address' => $email];
            if ($display_name !== '') {
                $address['displayName'] = sanitize_text_field($display_name);
            }
            $addresses[] = $address;
        }
        return $addresses;
    }

    public static function email_tracking(WC_Order $order, bool $sent_to_admin, bool $plain_text, $email): void {
        $tracking_url = esc_url((string) $order->get_meta('_utiliy_tracking_url'));
        if (!$tracking_url) {
            return;
        }
        $carrier = (string) $order->get_meta('_utiliy_tracking_carrier');
        $number = (string) $order->get_meta('_utiliy_tracking_number');
        if ($plain_text) {
            echo "\nTracking: " . $carrier . ' ' . $number . "\n" . $tracking_url . "\n";
            return;
        }
        echo '<h2>Track your shipment</h2><p>' . esc_html($carrier . ' ' . $number) .
            '<br><a href="' . $tracking_url . '">View tracking</a></p>';
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
            body.woocommerce-checkout .site-header .col-full{display:flex;align-items:center;justify-content:space-between;min-height:76px}
            body.woocommerce-checkout .site-header .col-full:after{content:"Secure checkout";color:var(--utiliy-muted);font-size:13px;font-weight:500}
            body.woocommerce-checkout .site-branding{flex:0 0 auto;width:auto!important;margin:0!important;text-align:left!important}
            body.woocommerce-checkout .site-title{margin:0!important;font-size:26px;font-weight:650;letter-spacing:-.045em;line-height:1;text-align:left!important}
            body.woocommerce-checkout .site-title a{color:#000;text-decoration:none}
            body.woocommerce-checkout .content-area{width:100%;float:none;margin:0}
            body.woocommerce-checkout .site-main{margin:0;padding-bottom:72px}
            body.woocommerce-checkout .entry-header{text-align:left;padding:44px 0 24px}
            body.woocommerce-checkout .entry-header:after{content:"Complete your order securely. US shipping is already included.";display:block;margin-top:9px;color:var(--utiliy-muted);font-size:14px}
            body.woocommerce-checkout .entry-title{margin:0;font-size:40px;font-weight:650;letter-spacing:-.05em;line-height:1}
            body.woocommerce-checkout .col-full{max-width:1160px;padding-inline:24px}
            body.woocommerce-checkout .entry-content{font-size:15px}
            body.woocommerce-checkout .wc-block-components-sidebar-layout{
                display:grid!important;
                grid-template-columns:minmax(0,1.45fr) minmax(360px,.8fr);
                align-items:stretch!important;
                max-width:1160px;
                margin-inline:auto;
                gap:56px
            }
            body.woocommerce-checkout .wc-block-checkout__main{
                grid-column:1;
                width:auto!important;
                max-width:none!important;
                padding:0!important;
                background:#fff;
                border:0;
                border-radius:0;
                box-sizing:border-box
            }
            body.woocommerce-checkout .wc-block-checkout__sidebar{
                grid-column:2;
                grid-row:1;
                align-self:stretch!important;
                width:auto!important;
                max-width:none!important;
                height:100%;
                margin:0!important;
                padding:28px;
                background:var(--utiliy-panel);
                border:0;
                border-radius:6px;
                box-sizing:border-box
            }
            body.woocommerce-checkout .wc-block-components-order-summary{border:0}
            body.woocommerce-checkout .wc-block-components-order-summary-item__image{width:64px!important}
            body.woocommerce-checkout .wc-block-components-order-summary-item__image>img{width:64px!important;height:64px!important;background:#fff;border-radius:4px;object-fit:contain;filter:none}
            body.woocommerce-checkout .wp-block-woocommerce-checkout-order-summary-block>.wc-block-components-checkout-step__heading{margin-bottom:16px}
            body.woocommerce-checkout .wp-block-woocommerce-checkout-order-summary-block .wc-block-components-title{font-size:20px;font-weight:600}
            body.woocommerce-checkout .wc-block-components-title,
            body.woocommerce-checkout .wc-block-components-checkout-step__heading{font-family:inherit;letter-spacing:-.025em}
            body.woocommerce-checkout .wc-block-components-checkout-step{margin-bottom:28px}
            body.woocommerce-checkout .wc-block-components-checkout-step__heading h2{font-size:20px;font-weight:600;letter-spacing:-.03em}
            body.woocommerce-checkout .wc-block-components-checkout-step__container{padding-left:0}
            body.woocommerce-checkout .wc-block-components-checkout-step__description,
            body.woocommerce-checkout .wc-block-components-formatted-money-amount{color:var(--utiliy-muted)}
            body.woocommerce-checkout button,
            body.woocommerce-checkout .button,
            body.woocommerce-checkout .wc-block-components-button{border-radius:4px!important;font-family:inherit;font-weight:500;text-transform:none}
            body.woocommerce-checkout .wc-block-components-button:not(.is-link){min-height:48px;background:#000!important;color:#fff!important;border:1px solid #000!important;box-shadow:none!important;font-size:14px!important}
            body.woocommerce-checkout .wc-block-components-button:not(.is-link):hover{background:#262626!important}
            body.woocommerce-checkout input:not([type="checkbox"]):not([type="radio"]),
            body.woocommerce-checkout select,
            body.woocommerce-checkout textarea,
            body.woocommerce-checkout .wc-block-components-text-input input{min-height:48px;border-radius:4px!important;border-color:rgba(0,0,0,.2)!important;box-shadow:none!important;background:#fff!important}
            body.woocommerce-checkout input[type="checkbox"],
            body.woocommerce-checkout input[type="radio"]{min-height:0!important;width:18px!important;height:18px!important}
            body.woocommerce-checkout .wc-block-components-radio-control{background:#fff;border:0!important;border-radius:6px;box-shadow:none!important}
            body.woocommerce-checkout .wc-block-components-radio-control--highlight-checked{border:0!important;box-shadow:none!important}
            body.woocommerce-checkout .wc-block-components-radio-control-accordion-option,
            body.woocommerce-checkout .wc-block-components-radio-control-accordion-option--checked-option-highlighted{border:1px solid var(--utiliy-line)!important;border-radius:6px!important;box-shadow:none!important;overflow:hidden}
            body.woocommerce-checkout .wc-block-components-radio-control__option{border:0!important;box-shadow:none!important}
            body.woocommerce-checkout a{color:#000;text-underline-offset:3px}
            @media(max-width:782px){body.admin-bar.woocommerce-checkout .site-header{top:46px}}
            @media(max-width:800px){
                body.woocommerce-checkout .wc-block-components-sidebar-layout{grid-template-columns:1fr;gap:28px}
                body.woocommerce-checkout .wc-block-checkout__main,
                body.woocommerce-checkout .wc-block-checkout__sidebar{grid-column:1}
                body.woocommerce-checkout .wc-block-checkout__sidebar{grid-row:auto;height:auto}
                body.woocommerce-checkout .col-full{padding-inline:16px}
                body.woocommerce-checkout .site-header .col-full{min-height:68px}
                body.woocommerce-checkout .site-title{font-size:23px}
                body.woocommerce-checkout .entry-header{padding:34px 0 20px}
                body.woocommerce-checkout .entry-title{font-size:34px}
                body.woocommerce-checkout .entry-header:after{font-size:14px}
                body.woocommerce-checkout .wc-block-checkout__main{padding:0!important}
                body.woocommerce-checkout .wc-block-checkout__sidebar{padding:20px}
            }
        </style>';
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
            'fulfillmentStatus' => (string) $order->get_meta('_utiliy_fulfillment_status'),
            'trackingUrl' => esc_url_raw((string) $order->get_meta('_utiliy_tracking_url')),
        ], 200);
    }

    private static function rate_limit() {
        $ip = self::client_ip();
        $key = 'utiliy_checkout_' . md5($ip);
        $count = (int) get_transient($key);
        if ($count >= 20) {
            return new WP_Error('rate_limited', 'Too many checkout attempts. Try again later.', ['status' => 429]);
        }
        set_transient($key, $count + 1, 10 * MINUTE_IN_SECONDS);
        return null;
    }

    private static function client_ip(): string {
        $remote = sanitize_text_field((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        $trusted_proxy = $remote === '127.0.0.1' || $remote === '::1' || !filter_var(
            $remote,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        );
        if ($trusted_proxy) {
            $forwarded = explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
            foreach ($forwarded as $candidate) {
                $candidate = trim($candidate);
                if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                    return $candidate;
                }
            }
        }
        return filter_var($remote, FILTER_VALIDATE_IP) ? $remote : 'unknown';
    }

    private static function product_guard_error(WC_Product $product): string {
        $data = self::supplier_data($product);
        if (($data['available'] ?? '') !== 'yes') {
            return $product->get_sku() . ' is paused until supplier availability is confirmed.';
        }
        $checked_at = (string) ($data['stock_checked_at'] ?? $data['cost_checked_at'] ?? '');
        if (!self::date_is_fresh($checked_at, 30)) {
            return $product->get_sku() . ' is paused for a supplier stock and cost review.';
        }
        $minimum = (int) ($data['minimum_price'] ?? 0);
        $selling = (int) round((float) $product->get_price() * 100);
        if (!$minimum || $selling < $minimum) {
            return $product->get_sku() . ' is paused because its price no longer meets the margin floor.';
        }
        return '';
    }

    private static function date_is_fresh(string $date, int $days): bool {
        $timestamp = strtotime($date . ' 23:59:59 UTC');
        return $timestamp !== false && $timestamp >= time() - ($days * DAY_IN_SECONDS);
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
            'stock_checked_at' => $read('stock_checked_at'),
            'available' => $read('available'),
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
        if ($status === 'Ordered from supplier') {
            echo '<hr><h3>Mark shipped</h3>';
            echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
            echo '<input type="hidden" name="action" value="utiliy_mark_shipped">';
            echo '<input type="hidden" name="order_id" value="' . esc_attr((string) $order->get_id()) . '">';
            wp_nonce_field('utiliy_mark_shipped_' . $order->get_id());
            echo '<p><label>Carrier<br><input class="regular-text" required name="carrier" placeholder="USPS, UPS, FedEx"></label></p>';
            echo '<p><label>Tracking number<br><input class="regular-text" required name="tracking_number"></label></p>';
            echo '<p><label>Tracking URL<br><input class="large-text" type="url" required name="tracking_url" placeholder="https://..."></label></p>';
            echo '<p><button class="button button-primary" type="submit">Mark shipped and email customer</button></p>';
            echo '</form>';
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

    public static function mark_shipped(): void {
        $order_id = absint($_POST['order_id'] ?? 0);
        check_admin_referer('utiliy_mark_shipped_' . $order_id);
        if (!current_user_can('manage_woocommerce')) {
            wp_die('You cannot edit this order.');
        }
        $order = wc_get_order($order_id);
        if (!$order) {
            wp_die('Order not found.');
        }
        $carrier = sanitize_text_field(wp_unslash($_POST['carrier'] ?? ''));
        $tracking_number = sanitize_text_field(wp_unslash($_POST['tracking_number'] ?? ''));
        $tracking_url = esc_url_raw(wp_unslash($_POST['tracking_url'] ?? ''));
        if (!$carrier || !$tracking_number || !$tracking_url) {
            wp_die('Carrier, tracking number, and tracking URL are required.');
        }
        $order->update_meta_data('_utiliy_fulfillment_status', 'Shipped');
        $order->update_meta_data('_utiliy_tracking_carrier', $carrier);
        $order->update_meta_data('_utiliy_tracking_number', $tracking_number);
        $order->update_meta_data('_utiliy_tracking_url', $tracking_url);
        $order->add_order_note(sprintf(
            'Shipped via %s. Tracking: %s (%s)',
            $carrier,
            $tracking_number,
            $tracking_url
        ));
        $order->save();
        $order->update_status('completed', 'Supplier shipment confirmed; customer completion email triggered.', true);
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
        $expected_skus = [];
        $expected_slugs = [];
        foreach ($catalog['products'] as $record) {
            self::sync_product($record);
            $expected_slugs[] = (string) $record['slug'];
            if (!empty($record['variants']) && is_array($record['variants'])) {
                foreach ($record['variants'] as $variant) {
                    $expected_skus[] = (string) $variant['sku'];
                }
            } else {
                $expected_skus[] = (string) $record['sku'];
            }
            $count++;
        }
        self::retire_removed_products($expected_skus, $expected_slugs);
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
            self::set_supplier_meta($product, array_merge($record['autods'] ?? [], [
                'available' => $record['available'] ?? true,
                'stockCheckedAt' => $record['stockCheckedAt'] ?? ($record['autods']['costCheckedAt'] ?? ''),
            ]));
            self::assert_margin($sku, (int) $record['price'], $product);
            self::apply_stock_guard($product);
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
        self::set_supplier_meta($parent, array_merge($record['autods'] ?? [], [
            'available' => $record['available'] ?? true,
            'stockCheckedAt' => $record['stockCheckedAt'] ?? ($record['autods']['costCheckedAt'] ?? ''),
        ]));

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
            $variation->set_manage_stock(false);
            $variation->set_virtual(false);
            $variation->set_attributes(['option' => (string) $variant_record['label']]);
            $variation->update_meta_data('_utiliy_managed', 'yes');
            $supplier = array_merge($record['autods'] ?? [], $variant_record['autods'] ?? [], [
                'available' => $variant_record['available'] ?? ($record['available'] ?? true),
                'stockCheckedAt' => $variant_record['stockCheckedAt']
                    ?? ($variant_record['autods']['costCheckedAt']
                    ?? ($record['stockCheckedAt']
                    ?? ($record['autods']['costCheckedAt'] ?? ''))),
            ]);
            self::set_supplier_meta($variation, $supplier);
            self::assert_margin($sku, (int) $variant_record['price'], $variation);
            self::apply_stock_guard($variation);
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
        $product->set_manage_stock(false);
        $product->set_virtual(false);
        $product->set_downloadable(false);
        $product->set_category_ids([$category_id]);
        $product->update_meta_data('_utiliy_managed', 'yes');
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
            'stock_checked_at' => (string) ($supplier['stockCheckedAt'] ?? ($supplier['costCheckedAt'] ?? '')),
            'available' => !isset($supplier['available']) || filter_var($supplier['available'], FILTER_VALIDATE_BOOLEAN) ? 'yes' : 'no',
        ];
        $meta['minimum_price'] = self::minimum_price($meta['supplier_cost'], $meta['shipping_cost']);
        foreach ($meta as $key => $value) {
            $product->update_meta_data('_utiliy_' . $key, $value);
        }
    }

    private static function apply_stock_guard(WC_Product $product): void {
        $available = $product->get_meta('_utiliy_available') === 'yes';
        $checked_at = (string) $product->get_meta('_utiliy_stock_checked_at');
        $product->set_stock_status($available && self::date_is_fresh($checked_at, 30) ? 'instock' : 'outofstock');
    }

    private static function retire_removed_products(array $expected_skus, array $expected_slugs): void {
        $expected_skus = array_flip(array_filter($expected_skus));
        $expected_slugs = array_flip(array_filter($expected_slugs));
        $products = wc_get_products([
            'status' => ['publish', 'draft', 'private'],
            'limit' => -1,
            'return' => 'objects',
        ]);
        foreach ($products as $product) {
            if ($product->get_meta('_utiliy_managed') !== 'yes') {
                continue;
            }
            if ($product->is_type('variable')) {
                if (!isset($expected_slugs[$product->get_slug()])) {
                    $product->set_status('draft');
                    $product->set_stock_status('outofstock');
                    $product->save();
                }
                continue;
            }
            $sku = $product->get_sku();
            if ($sku && !isset($expected_skus[$sku])) {
                $product->set_status('draft');
                $product->set_stock_status('outofstock');
                $product->save();
            }
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

}

Utiliy_Commerce::boot();
