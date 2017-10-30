(function ($) {
    function LiveSearch(element) {

        var that = this;
        this.inputEl = element;
        this.searchResultsIsVisible = false;

        this.init = function () {
            this.form = this.inputEl.closest('form');
            this.serviceUrl = this.form.data('live-search-url');
            this.searchBox = this.form.find('.live-search__search-box');
            this.searchResultContainer = this.form.find('.live-search__result');
            this.noResults = this.form.find('.live-search__no-results');
            this.bindKeyUp();
            this.bindBackdropClick();
        };

        /**
         * Bind key click events
         */
        this.bindKeyUp = function () {
            that.inputEl.on('keyup', function(e) {
                switch (e.which) {
                    case 40: // down arrow
                        that.next();
                        break;
                    case 38: // up arrow
                        that.prev();
                        break;
                    case 27: // esc
                        that.hideMenu();
                        break;
                    default:
                        that.processInput();
                        break;
                }
            });
        };

        /**
         * Process query input
         */
        this.processInput = function () {
            var searchTerm = that.inputEl.val().toLowerCase();
            if (searchTerm.length > 1) {
                that.getHits(searchTerm);
            }
            else {
                that.hideMenu();
            }
        };

        /**
         * Show the result menu
         */
        this.showMenu = function() {
            this.setSearchResultWidth();
            that.searchResultContainer.show();
            that.searchResultsIsVisible = true;
        };

        /**
         * Hide the result menu
         */
        this.hideMenu = function () {
            that.emptyMenu();
            that.searchResultContainer.hide();
            that.searchResultsIsVisible = false;
        };

        /**
         * Empty the result menu
         */
        this.emptyMenu = function () {
            that.searchResultContainer.empty();
        };

        /**
         * Selects the current active search result
         * and adds the result value to the input field
         */
        this.select = function () {
            var val = this.searchResultContainer.find('.live-search__hit--active').data('value');
            that.inputEl.val(val);
        };

        /**
         * Selects the next item in the result menu
         * If last, selects the first
         */
        this.next = function () {
            var active = that.searchResultContainer.find('.live-search__hit--active').removeClass('live-search__hit--active');
            var next = active.next();

            if (!next.length) {
                next = $(that.searchResultContainer.find('li')[0]);
            }

            next.addClass('live-search__hit--active');
            that.select();
        };

        /**
         * Selects the previous item in the result menu
         */
        this.prev = function () {
            var active = that.searchResultContainer.find('.live-search__hit--active').removeClass('live-search__hit--active');
            var prev = active.prev();

            if (!prev.length) {
                prev = $(that.searchResultContainer.find('li')[0]);
            }

            prev.addClass('live-search__hit--active');
            that.select();
        };

        /**
         * Does a ajax request for the search term
         * @param searchTerm
         */
        this.getHits = function (searchTerm) {
            that.searchBox.addClass('live-search__search-box--loading');
            $.ajax({
                url: that.serviceUrl,
                data: {
                    q: searchTerm
                },
                success: function (data) {
                    that.processHits(data.hits, searchTerm);
                }
            }).done(function() {
                that.searchBox.removeClass('live-search__search-box--loading');
            });
        };

        /**
         * Processes the hits returned by this.getHits
         * Creates the result menu
         * @param hits
         */
        this.processHits = function (hits, searchTerm) {
            if (hits.length) {
                that.hasResults = true;
                that.noResults.hide();
                that.emptyMenu();
                that.showMenu();
                $.each(hits, function(index, hit) {
                    var linkEl = $('<a class="live-search__hit-link" href="' + hit.url +'"/>');
                    var reg = new RegExp(searchTerm, 'gi');
                    var hitName = hit.name.replace(reg, function(str) {return '<b>'+str+'</b>';});

                    var titleEl = $('<h4 class="live-search__hit-heading">' + hitName + '</h4>');
                    //var descEl = hit.desc ? $('<p>' + hit.desc + '</p>') : null;
                    var listEl = $('<li class="live-search__hit" data-value="' + hit.name + '"/>');
                    linkEl.append(titleEl);
                    listEl.append(linkEl);

                    that.searchResultContainer.append(listEl);
                });
            }
            else {
                that.hasResults = false;
                that.emptyMenu();
                that.hideMenu();
                that.noResults.show();
            }
        };

        /**
         * Click outside of search box
         */
        this.bindBackdropClick = function () {
            $(document).on('click', $.proxy(function (e) {
                var clickIsOnForm = $(e.target).closest(this.form).length;
                var clickIsOnSearchResultContainer = $(e.target).closest(this.searchResultContainer).length;
                if (that.searchResultsIsVisible && !clickIsOnForm && !clickIsOnSearchResultContainer) {
                    this.hideMenu();
                }
            }, this));
        };

        /**
         * Set the width of the search results
         * Should be identical to search input width
         */
        this.setSearchResultWidth = function () {
            var inputWidth = that.inputEl.outerWidth();
            that.searchResultContainer.outerWidth(inputWidth);
        };
    }

    $.fn.liveSearch = function (options) {
        return this.each(function () {
            var element = $(this);

            // Return early if this element already has a plugin instance
            if (element.data('liveSearch')) {
                return;
            }

            // pass options to plugin constructor
            var liveSearch = new LiveSearch(element);
            liveSearch.init();

            // Store plugin object in this element's data
            element.data('liveSearch', liveSearch);
        });
    };
})(jQuery);