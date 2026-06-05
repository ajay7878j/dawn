if (!customElements.get('product-card-quick-add')) {
  customElements.define(
    'product-card-quick-add',
    class ProductCardQuickAdd extends HTMLElement {
      constructor() {
        super();

        this.handleAddClick = this.handleAddClick.bind(this);
        this.handleCartUpdate = this.handleCartUpdate.bind(this);
        this.handleQuantityChange = this.handleQuantityChange.bind(this);
      }

      connectedCallback() {
        this.variantId = Number(this.dataset.variantId);
        this.cartQuantity = Number(this.dataset.cartQuantity || 0);
        this.addContainer = this.querySelector('[data-product-card-add]');
        this.addButton = this.querySelector('[data-product-card-add-button]');
        this.quantityContainer = this.querySelector('[data-product-card-quantity]');
        this.quantityInput = this.querySelector('.quantity__input');
        this.errorMessage = this.querySelector('[data-product-card-error]');
        this.unsubscribe = subscribe(PUB_SUB_EVENTS.cartUpdate, this.handleCartUpdate);

        this.addButton?.addEventListener('click', this.handleAddClick);
        this.quantityContainer?.addEventListener('change', this.handleQuantityChange);

        this.applyQuantity(this.cartQuantity);
      }

      disconnectedCallback() {
        if (this.unsubscribe) this.unsubscribe();
      }

      applyQuantity(quantity) {
        const nextQuantity = Math.max(Number(quantity) || 0, 0);
        const quantityChanged = nextQuantity !== this.cartQuantity;
        const showQuantitySelector = nextQuantity > 0;

        this.cartQuantity = nextQuantity;
        this.dataset.cartQuantity = nextQuantity;

        if (this.addContainer) this.addContainer.hidden = showQuantitySelector;
        if (this.quantityContainer) this.quantityContainer.hidden = !showQuantitySelector;

        if (this.quantityInput) {
          this.quantityInput.value = nextQuantity;
          this.quantityInput.setAttribute('value', nextQuantity);
          this.quantityInput.dataset.cartQuantity = nextQuantity;
        }

        if (this.errorMessage) {
          this.errorMessage.textContent = '';
        }

        if (quantityChanged) {
          publish(PUB_SUB_EVENTS.quantityUpdate);
        }
      }

      setLoading(isLoading) {
        this.isLoading = isLoading;
        this.classList.toggle('is-loading', isLoading);

        if (this.addButton) {
          this.addButton.classList.toggle('loading', isLoading);
          this.addButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        }

        if (this.quantityInput) {
          this.quantityInput.readOnly = isLoading;
        }

        if (this.quantityContainer) {
          this.quantityContainer.querySelectorAll('button').forEach((button) => {
            button.disabled = isLoading;
          });
        }
      }

      handleAddClick(event) {
        event.preventDefault();

        if (this.isLoading || this.cartQuantity > 0) return;

        const previousQuantity = this.cartQuantity;
        this.applyQuantity(1);
        this.setLoading(true);
        this.updateCart(1, previousQuantity);
      }

      handleQuantityChange(event) {
        if (this.isLoading) return;

        const input = event.target;
        if (input !== this.quantityInput) return;

        if (!this.validateQuantity(input)) {
          input.value = this.cartQuantity;
          input.setAttribute('value', this.cartQuantity);
          return;
        }

        const nextQuantity = Number(input.value);
        if (nextQuantity === this.cartQuantity) return;

        this.setLoading(true);
        this.updateCart(nextQuantity, this.cartQuantity);
      }

      validateQuantity(input) {
        const value = Number.parseInt(input.value, 10);
        const min = Number.parseInt(input.dataset.min || input.min || '0', 10);
        const max = input.max ? Number.parseInt(input.max, 10) : null;
        const step = Number.parseInt(input.step || '1', 10);
        let message = '';

        if (Number.isNaN(value)) {
          message = window.cartStrings.error;
        } else if (value < min) {
          message = window.quickOrderListStrings.min_error.replace('[min]', min);
        } else if (max !== null && value > max) {
          message = window.quickOrderListStrings.max_error.replace('[max]', max);
        } else if (step && value % step !== 0) {
          message = window.quickOrderListStrings.step_error.replace('[step]', step);
        }

        if (message) {
          input.setCustomValidity(message);
          input.reportValidity();
          input.setCustomValidity('');
          return false;
        }

        input.setCustomValidity('');
        return true;
      }

      updateCart(nextQuantity, previousQuantity) {
        const body = JSON.stringify({
          updates: {
            [this.variantId]: nextQuantity,
          },
        });

        fetch(routes.cart_update_url, { ...fetchConfig(), body })
          .then((response) => response.json())
          .then((cartState) => {
            if (cartState.errors || cartState.status) {
              throw new Error(cartState.description || window.cartStrings.error);
            }

            const updatedQuantity = this.getVariantQuantity(cartState);
            this.applyQuantity(updatedQuantity);

            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: 'product-card-quick-add',
              cartData: cartState,
              variantId: this.variantId,
            });
          })
          .catch((error) => {
            this.applyQuantity(previousQuantity);
            if (this.errorMessage) this.errorMessage.textContent = error.message || window.cartStrings.error;
          })
          .finally(() => {
            this.setLoading(false);
          });
      }

      getVariantQuantity(cartState) {
        if (!cartState || !Array.isArray(cartState.items)) return this.cartQuantity;

        const matchingItem = cartState.items.find((item) => Number(item.variant_id) === this.variantId);
        return matchingItem ? Number(matchingItem.quantity) : 0;
      }

      handleCartUpdate(event) {
        if (!event?.cartData) return;

        const updatedQuantity = this.getVariantQuantity(event.cartData);
        if (updatedQuantity !== this.cartQuantity) {
          this.applyQuantity(updatedQuantity);
        }
      }
    }
  );
}
