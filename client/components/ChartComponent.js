/** @jsx React.DOM */

// Constants
var Events = require('../Events');
var debug = require('../Helpers').debug;

// Global variables
var store = require('../store');

var $chart = null;

function DEBUG(text) {
    return debug('Chart Component - ' + text);
}

// Components
module.exports = React.createClass({

    getInitialState: function() {
        return {
            account: null,
            operations: [],
            categories: [],
            kind: 'all'         // which chart are we showing?
        }
    },

    _reload: function() {
        DEBUG('reload');
        this.setState({
            account:    store.currentAccount,
            operations: store.operations,
            categories: store.categories
        }, this._redraw);
    },

    componentDidMount: function() {
        store.subscribeMaybeGet(Events.OPERATIONS_LOADED, this._reload);
        store.subscribeMaybeGet(Events.CATEGORIES_LOADED, this._reload);
        $chart = $('#chart');
    },

    componentWillUnmount: function() {
        store.removeListener(Events.OPERATIONS_LOADED, this._reload);
        store.removeListener(Events.CATEGORIES_LOADED, this._reload);
    },

    _redraw: function() {
        DEBUG('redraw');
        switch (this.state.kind) {
            case 'all':
                CreateChartAllByCategoryByMonth(this.state.operations);
                break;
            case 'balance':
                CreateChartBalance(this.state.account, this.state.operations);
                break;
            case 'by-category':
                var val = this.refs.select.getDOMNode().value;
                CreateChartByCategoryByMonth(val, this.state.operations);
                break;
            case 'pos-neg':
                CreateChartPositiveNegative(this.state.operations);
                break;
            case 'global-pos-neg':
                CreateChartPositiveNegative(store.getOperationsOfAllAccounts());
                break;
            default:
                assert(true === false, 'unexpected value in _redraw: ' + this.state.kind);
        }
    },

    _changeKind: function(kind) {
        this.setState({
            kind: kind
        }, this._redraw);
    },
    _onClickAll: function() {
        this._changeKind('all');
    },
    _onClickByCategory: function() {
        this._changeKind('by-category');
    },
    _onClickBalance: function() {
        this._changeKind('balance');
    },
    _onClickPosNeg: function() {
        this._changeKind('pos-neg');
    },
    _onClickGlobalPosNeg: function() {
        this._changeKind('global-pos-neg');
    },

    render: function() {
        var categoryOptions = this.state.categories.map(function (c) {
            return (<option key={c.id} value={c.id}>{c.title}</option>);
        });

        var maybeSelect = this.state.kind !== 'by-category' ? '' :
            <select onChange={this._redraw} ref='select'>
                {categoryOptions}
            </select>

        return (
        <div>
            <h1>Charts</h1>

            <div>
                <button onClick={this._onClickAll}>All categories by month</button>
                <button onClick={this._onClickByCategory}>By category by month</button>
                <button onClick={this._onClickBalance}>Balance over time</button>
                <button onClick={this._onClickPosNeg}>Ins / outs over time (this account)</button>
                <button onClick={this._onClickGlobalPosNeg}>Ins / outs over time (all accounts)</button>
            </div>

            {maybeSelect}

            <div id='chart'></div>
        </div>
        );
    }
});

// Charts
function CreateChartByCategoryByMonth(catId, operations) {
    var ops = operations.slice().filter(function(op) {
        return op.categoryId === catId;
    });
    CreateChartAllByCategoryByMonth(ops);
}

function CreateChartAllByCategoryByMonth(operations) {

    function datekey(op) {
        var d = op.date;
        return d.getFullYear() + '-' + d.getMonth();
    }

    // Category -> {Month -> [Amounts]}
    var map = {};
    // Datekey -> Date
    var dateset = {};
    for (var i = 0; i < operations.length; i++) {
        var op = operations[i];
        var c = store.categoryToLabel(op.categoryId);
        map[c] = map[c] || {};

        var dk = datekey(op);
        map[c][dk] = map[c][dk] || [];
        map[c][dk].push(op.amount);
        dateset[dk] = +op.date;
    }

    // Sort date in ascending order: push all pairs of (datekey, date) in an
    // array and sort that array by the second element. Then read that array in
    // ascending order.
    var dates = [];
    for (var dk in dateset) {
        dates.push([dk, dateset[dk]]);
    }
    dates.sort(function(a, b) {
        return a[1] - b[1];
    });

    var series = [];
    for (var c in map) {
        var data = [];

        for (var j = 0; j < dates.length; j++) {
            var dk = dates[j][0];
            map[c][dk] = map[c][dk] || [];
            data.push(map[c][dk].reduce(function(a, b) { return a + b }, 0));
        }

        var serie = {
            name: c,
            data: data
        };

        series.push(serie);
    }

    var categories = [];
    for (var i = 0; i < dates.length; i++) {
        var date = new Date(dates[i][1]);
        var str = date.toLocaleDateString(/* use the default locale */ undefined, {
            year: 'numeric',
            month: 'long'
        });
        categories.push(str);
    }

    var title = 'By category';
    var yAxisLegend = 'Amount';

    $chart.highcharts({
        chart: {
            type: 'column'
        },
        title: {
            text: title
        },
        xAxis: {
            categories: categories
        },
        yAxis: {
            title: {
                text: yAxisLegend
            }
        },
        tooltip: {
            headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
            pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
            '<td style="padding:0"><b>{point.y:.1f} eur</b></td></tr>',
            footerFormat: '</table>',
            shared: true,
            useHTML: true
        },
        plotOptions: {
            column: {
                pointPadding: 0.2,
                borderWidth: 0
            }
        },
        series: series
    });
}

function CreateChartBalance(account, operations) {

    var ops = operations.sort(function (a,b) { return +a.date - +b.date });

    // Date (day) -> sum amounts of this day (scalar)
    var opmap = {};
    ops.map(function(o) {
        // Convert date into a number: it's going to be converted into a string
        // when used as a key.
        var a = o.amount;
        var d = +o.date;
        opmap[d] = opmap[d] || 0;
        opmap[d] += a;
    })

    var balance = account.initialAmount;
    var bal = [];
    for (var date in opmap) {
        // date is a string now: convert it back to a number for highcharts.
        balance += opmap[date];
        bal.push([+date, balance]);
    }

    // Create the chart
    $chart.highcharts('StockChart', {
        rangeSelector : {
            selected : 1
        },

        title : {
            text : 'Balance'
        },

        series : [{
            name : 'Balance',
            data : bal,
            tooltip: { valueDecimals: 2 }
        }]
    });
}

function CreateChartPositiveNegative(operations) {

    function datekey(op) {
        var d = op.date;
        return d.getFullYear() + '-' + d.getMonth();
    }

    const POS = 0, NEG = 1, BAL = 2;

    // Month -> [Positive amount, Negative amount, Diff]
    var map = {};
    // Datekey -> Date
    var dateset = {};
    for (var i = 0; i < operations.length; i++) {
        var op = operations[i];
        var dk = datekey(op);
        map[dk] = map[dk] || [0, 0, 0];

        map[dk][POS] += op.amount > 0 ? op.amount : 0;
        map[dk][NEG] += op.amount < 0 ? -op.amount : 0;
        map[dk][BAL] += op.amount;

        dateset[dk] = +op.date;
    }

    // Sort date in ascending order: push all pairs of (datekey, date) in an
    // array and sort that array by the second element. Then read that array in
    // ascending order.
    var dates = [];
    for (var dk in dateset) {
        dates.push([dk, dateset[dk]]);
    }
    dates.sort(function(a, b) {
        return a[1] - b[1];
    });

    var series = [];
    function addSerie(name, mapIndex) {
        var data = [];
        for (var i = 0; i < dates.length; i++) {
            var dk = dates[i][0];
            data.push(map[dk][mapIndex]);
        }
        var serie = {
            name: name,
            data: data
        };
        series.push(serie);
    }

    addSerie('Positive', POS);
    addSerie('Negative', NEG);
    addSerie('Balance', BAL);

    var categories = [];
    for (var i = 0; i < dates.length; i++) {
        var date = new Date(dates[i][1]);
        var str = date.toLocaleDateString(/* use the default locale */ undefined, {
            year: 'numeric',
            month: 'long'
        });
        categories.push(str);
    }

    var title = 'Positive / Negative over time';
    var yAxisLegend = 'Amount';

    $chart.highcharts({
        chart: {
            type: 'column'
        },
        title: {
            text: title
        },
        xAxis: {
            categories: categories
        },
        yAxis: {
            title: {
                text: yAxisLegend
            }
        },
        tooltip: {
            headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
            pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
            '<td style="padding:0"><b>{point.y:.1f} eur</b></td></tr>',
            footerFormat: '</table>',
            shared: true,
            useHTML: true
        },
        plotOptions: {
            column: {
                pointPadding: 0.2,
                borderWidth: 0
            }
        },
        series: series
    });
}
