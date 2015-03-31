// Constants
import Events from '../Events';
import {assert, debug, translate as t} from '../Helpers';

// Global variables
import store from '../store';
import flux from '../flux/dispatcher';

function DEBUG(text) {
    return debug('Similarity Component - ' + text);
}

// Algorithm

function findRedundantPairs(operations, duplicateThreshold) {
    DEBUG('Running findRedundantPairs algorithm...');
    DEBUG('Input: ' + operations.length + ' operations');
    var similar = [];

    // duplicateThreshold is in hours
    var threshold = duplicateThreshold * 60 * 60 * 1000;
    DEBUG('Threshold: ' + threshold);

    function areSimilarOperations(a, b) {
        if (a.amount != b.amount)
            return false;
        var datediff = Math.abs(+a.date - +b.date);
        return datediff <= threshold;
    }

    // O(n log n)
    function sortCriteria(a,b) { return a.amount - b.amount; }
    var sorted = operations.slice().sort(sortCriteria);
    for (var i = 0; i < operations.length; ++i) {
        if (i + 1 >= operations.length)
            continue;

        var op = sorted[i];
        var next = sorted[i+1];
        if (areSimilarOperations(op, next))
            similar.push([op, next]);
    }

    DEBUG(similar.length + ' pairs of similar operations found');
    return similar;
}

// Components
class SimilarityItemComponent extends React.Component {
    render() {
        return (
            <tr>
                <td>{this.props.operation.date.toLocaleDateString()}</td>
                <td>{this.props.operation.title}</td>
                <td>{this.props.operation.amount}</td>
                <td>{store.categoryToLabel(this.props.operation.categoryId)}</td>
                <td>{new Date(this.props.operation.dateImport).toLocaleString()}</td>
                <td><button className="btn btn-danger" onClick={this.props.ondelete}>
                        <span className="glyphicon glyphicon-remove" aria-hidden="true"></span>
                    </button>
                </td>
            </tr>
        );
    }
}

class SimilarityPairComponent extends React.Component {

    render() {

        var makeOndelete = (id) => {
            return (e) => {
                assert(id === 'a' || id === 'b');
                var toDelete = this.props[id];
                var toKeep = this.props[(id === 'a') ? 'b' : 'a'];

                // If the one to delete had a category and the one to keep
                // doesn't, automatically transfer category.
                if (toDelete.categoryId !== -1 && toKeep.categoryId === -1) {
                    var catId = toDelete.categoryId;
                    flux.dispatch({
                        type: Events.user.updated_category_of_operation,
                        operationId: toKeep.id,
                        categoryId: catId
                    });
                }

                flux.dispatch({
                    type: Events.user.deleted_operation,
                    operation: toDelete
                });

                e.preventDefault();
            }
        }

        return (
            <table className="table table-striped table-bordered">
                <thead>
                    <tr>
                        <th className="col-xs-2">Date</th>
                        <th className="col-xs-3">Title</th>
                        <th className="col-xs-1">Amount</th>
                        <th className="col-xs-2">Category</th>
                        <th className="col-xs-3">Imported on</th>
                        <th className="col-xs-1">Delete</th>
                    </tr>
                </thead>
                <tbody>
                    <SimilarityItemComponent operation={this.props.a} ondelete={makeOndelete('a')} />
                    <SimilarityItemComponent operation={this.props.b} ondelete={makeOndelete('b')} />
                </tbody>
            </table>
        );
    }
}

export default class Similarity extends React.Component {

    constructor() {
        this.state = {
            pairs: []
        };
    }

    listener() {
        this.setState({
            pairs: findRedundantPairs(store.getCurrentOperations(),
                                      store.getSetting('duplicateThreshold'))
        });
    }

    componentDidMount() {
        store.subscribeMaybeGet(Events.state.operations, this.listener.bind(this));
    }

    componentWillUnmount() {
        store.removeListener(Events.state.operations, this.listener.bind(this));
    }

    render() {
        var pairs = this.state.pairs;

        var sim
        if (pairs.length === 0) {
            sim = <div>{t('No similar operations found.')}</div>
        } else {
            sim = pairs.map(function (p) {
                var key = p[0].id.toString() + p[1].id.toString();
                return (<SimilarityPairComponent key={key} a={p[0]} b={p[1]}  />)
            });
        }
        return (
            <div>
                <div className="top-panel panel panel-default">
                    <div className="panel-heading">
                        <h3 className="title panel-title">{t('Similarities')}</h3>
                    </div>
                    <div className="panel-body">
                        <div className="alert alert-info">
                            <span className="glyphicon glyphicon-exclamation-sign"></span>{t('similarities_help')}</div>
                        {sim}
                    </div>
                </div>
            </div>)
    }
}
